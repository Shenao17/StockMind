package com.stockmind.service;

import com.stockmind.billing.PaymentService;
import com.stockmind.billing.SubscriptionService;
import com.stockmind.dto.RegistrationDTO;
import com.stockmind.exception.ConflictException;
import com.stockmind.mail.EmailSender;
import com.stockmind.model.EmailVerificationToken;
import com.stockmind.model.Organization;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
import com.stockmind.repository.EmailVerificationTokenRepository;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;

/**
 * RegistrationService — Alta de empresas (tenants) y activación por correo.
 *
 * Dos entradas, un solo código:
 *  - selfSignup:       desde la landing. La empresa queda PENDING hasta verificar el correo del
 *                      administrador; al verificar pasa a ACTIVE con prueba gratis.
 *  - createByPlatform: desde el panel del dueño de la plataforma. Queda ACTIVE de inmediato.
 *
 * La empresa y su primer administrador se crean en UNA transacción: nunca queda una sin la otra.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RegistrationService {

    static final String GENERIC_CONFLICT =
        "No pudimos completar el registro con esos datos. Si ya tienes una cuenta, inicia sesión o contacta a soporte.";
    static final String INVALID_TOKEN =
        "El enlace de verificación no es válido o ya venció. Solicita uno nuevo.";
    private static final int RESEND_COOLDOWN_SECONDS = 60;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final EmailVerificationTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailSender emailSender;
    private final SubscriptionService subscriptionService;
    private final PaymentService paymentService;

    @Value("${stockmind.trial-days:14}")
    private int trialDays;

    @Value("${stockmind.verification-hours:24}")
    private int verificationHours;

    @Value("${stockmind.terms-version:2026-11}")
    private String termsVersion;

    @Value("${app.public-url:http://localhost:5173}")
    private String publicUrl;

    // ───────────────────────────── Autoregistro ─────────────────────────────

    @Transactional
    public Organization selfSignup(RegistrationDTO.SelfSignup req) {
        String email = normalizeEmail(req.getAdminEmail());
        String taxId = normalizeTaxId(req.getTaxId());
        // Mensaje genérico: no se revela si el conflicto es el correo o el NIT
        if (userRepository.existsByEmail(email) || organizationRepository.existsByTaxId(taxId)) {
            throw new ConflictException(GENERIC_CONFLICT);
        }

        Plan plan = subscriptionService.planByCode(req.getPlanCode());   // 400 si el plan no existe
        Organization org = newOrganization(req, taxId, email, Organization.Status.PENDING,
            Organization.Origin.SELF_SIGNUP);
        org.setTermsAcceptedAt(LocalDateTime.now());
        org.setTermsVersion(termsVersion);
        org = organizationRepository.save(org);

        User admin = userRepository.save(newAdmin(org, email, req.getPassword(), false));
        subscriptionService.createPendingTrial(org, plan);   // la prueba corre al verificar el correo
        issueTokenAndSend(admin);
        log.info("Autoregistro: empresa {} creada en estado PENDING", org.getId());
        return org;
    }

    // ─────────────────────── Alta desde el panel de plataforma ───────────────────────

    @Transactional
    public Organization createByPlatform(RegistrationDTO.ByPlatform req) {
        String email = normalizeEmail(req.getAdminEmail());
        String taxId = normalizeTaxId(req.getTaxId());
        // Aquí quien llama es el dueño de la plataforma: puede saber exactamente qué choca
        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("Ya existe un usuario con el correo " + email);
        }
        if (organizationRepository.existsByTaxId(taxId)) {
            throw new ConflictException("Ya existe una empresa con el NIT " + taxId);
        }

        String contact = req.getContactEmail() == null || req.getContactEmail().isBlank()
            ? email : normalizeEmail(req.getContactEmail());
        Plan plan = subscriptionService.planByCode(req.getPlanCode());
        Organization org = organizationRepository.save(newOrganization(req, taxId, contact,
            Organization.Status.ACTIVE, Organization.Origin.PLATFORM_ADMIN));
        userRepository.save(newAdmin(org, email, req.getPassword(), true));

        switch (req.getMode() == null ? RegistrationDTO.ByPlatform.Mode.TRIAL : req.getMode()) {
            case COMPLIMENTARY -> subscriptionService.createComplimentary(org, plan);
            case PAID -> {
                // Pago acordado por teléfono: se registra y el plan queda activo de inmediato
                subscriptionService.createPendingTrial(org, plan);
                paymentService.recordManualPayment(org.getId(), plan.getCode(), req.getBillingCycle());
            }
            default -> subscriptionService.createTrial(org, plan);
        }
        log.info("Empresa {} creada desde el panel de plataforma", org.getId());
        return org;
    }

    // ───────────────────────────── Verificación de correo ─────────────────────────────

    @Transactional
    public void verifyEmail(String rawToken) {
        LocalDateTime now = LocalDateTime.now();
        EmailVerificationToken token = tokenRepository.findByTokenHash(sha256(rawToken.trim()))
            .orElseThrow(() -> new IllegalStateException(INVALID_TOKEN));
        // Mismo mensaje para inexistente, usado y vencido: no se filtra información
        if (token.getUsedAt() != null || token.getExpiresAt().isBefore(now)) {
            throw new IllegalStateException(INVALID_TOKEN);
        }

        User user = userRepository.findById(token.getUserId())
            .orElseThrow(() -> new IllegalStateException(INVALID_TOKEN));
        token.setUsedAt(now);
        tokenRepository.save(token);
        user.setEmailVerifiedAt(now);
        userRepository.save(user);

        Organization org = organizationRepository.findById(user.getOrganizationId())
            .orElseThrow(() -> new IllegalStateException(INVALID_TOKEN));
        if (org.getStatus() == Organization.Status.PENDING) {
            org.setStatus(Organization.Status.ACTIVE);
            Subscription started = subscriptionService.startTrial(org.getId());
            org.setTrialEndsAt(started.getTrialEndsAt());
            organizationRepository.save(org);
            log.info("Empresa {} activada; prueba gratis hasta {}", org.getId(), org.getTrialEndsAt());
        }
    }

    /**
     * Reenvía el enlace. NUNCA revela si el correo existe: el resultado es siempre el mismo.
     * Solo actúa si hay un usuario sin verificar de una empresa pendiente, y no más de una vez por minuto.
     */
    @Transactional
    public void resendVerification(String email) {
        Optional<User> found = userRepository.findByEmail(normalizeEmail(email));
        if (found.isEmpty()) return;
        User user = found.get();
        if (user.getEmailVerifiedAt() != null || user.getOrganizationId() == null) return;

        boolean pending = organizationRepository.findById(user.getOrganizationId())
            .map(o -> o.getStatus() == Organization.Status.PENDING).orElse(false);
        if (!pending) return;

        boolean recentlySent = tokenRepository.findTopByUserIdOrderByCreatedAtDesc(user.getId())
            .map(t -> t.getCreatedAt().isAfter(LocalDateTime.now().minusSeconds(RESEND_COOLDOWN_SECONDS)))
            .orElse(false);
        if (recentlySent) return;

        issueTokenAndSend(user);
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private Organization newOrganization(RegistrationDTO.Company req, String taxId, String contactEmail,
                                         Organization.Status status, Organization.Origin origin) {
        return Organization.builder()
            .name(req.getCompanyName().trim())
            .legalName(blankToNull(req.getLegalName()))
            .taxId(taxId)
            .contactEmail(contactEmail)
            .phone(blankToNull(req.getPhone()))
            .country(req.getCountry() == null || req.getCountry().isBlank()
                ? "CO" : req.getCountry().toUpperCase(Locale.ROOT))
            .status(status)
            .origin(origin)
            .build();
    }

    private User newAdmin(Organization org, String email, String password, boolean verified) {
        return User.builder()
            .organizationId(org.getId())
            .username(usernameFromEmail(email))
            .email(email)
            .passwordHash(passwordEncoder.encode(password))
            .role(User.Role.ADMIN)
            .active(true)
            .emailVerifiedAt(verified ? LocalDateTime.now() : null)
            .build();
    }

    private void issueTokenAndSend(User user) {
        tokenRepository.invalidatePending(user.getId(), LocalDateTime.now());

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        tokenRepository.save(EmailVerificationToken.builder()
            .userId(user.getId())
            .tokenHash(sha256(rawToken))
            .expiresAt(LocalDateTime.now().plusHours(verificationHours))
            .build());

        String url = publicUrl.replaceAll("/+$", "") + "/verify-email?token=" + rawToken;
        // El correo se envía solo si la transacción se confirma (nunca por un registro revertido)
        afterCommit(() -> {
            try {
                emailSender.sendVerificationEmail(user.getEmail(), user.getUsername(), url);
            } catch (Exception e) {
                log.error("No se pudo enviar el correo de verificación a {}", user.getEmail(), e);
            }
        });
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /** "900.123.456-7" → "900123456-7" (mayúsculas, sin puntos ni espacios). */
    public static String normalizeTaxId(String taxId) {
        return taxId.trim().toUpperCase(Locale.ROOT).replace(".", "").replace(" ", "");
    }

    /** Nombre visible inicial: la parte local del correo, limpia y de 3 a 50 caracteres. */
    static String usernameFromEmail(String email) {
        String local = email.substring(0, email.indexOf('@')).replaceAll("[^a-z0-9._-]", "-");
        if (local.length() > 50) local = local.substring(0, 50);
        while (local.length() < 3) local += "x";
        return local;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    static String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
