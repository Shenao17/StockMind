package com.stockmind.platform;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.billing.AuditService;
import com.stockmind.dto.PageResponse;
import com.stockmind.dto.RequestDTO;
import com.stockmind.exception.ConflictException;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Organization;
import com.stockmind.model.PlatformRequest;
import com.stockmind.model.PlatformRequest.Status;
import com.stockmind.model.PlatformRequest.Type;
import com.stockmind.model.Subscription;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PlanRepository;
import com.stockmind.repository.PlatformRequestRepository;
import com.stockmind.service.RegistrationService;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * PlatformRequestService — Solicitudes de acciones sensibles con aprobación del Dueño.
 *
 * Soporte y Cobranza piden (con motivo); el Dueño aprueba con su PIN —y entonces la acción se ejecuta
 * en la misma transacción— o rechaza con una nota. Si la ejecución falla (p. ej. el NIT ya existe) la
 * solicitud sigue pendiente y el error llega al Dueño. Una solicitud pendiente vence a los 7 días.
 */
@Service
@RequiredArgsConstructor
public class PlatformRequestService {

    public static final int TTL_DAYS = 7;
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final PlatformRequestRepository repository;
    private final OrganizationRepository organizationRepository;
    private final PlanRepository planRepository;
    private final PlatformActionService actions;
    private final AuditService auditService;
    private final ObjectMapper mapper;

    // ───────────────────────────── Crear ─────────────────────────────

    @Transactional
    public RequestDTO.Row create(String requester, RequestDTO.Create body) {
        Organization org = organizationRepository.findById(body.getOrganizationId())
            .orElseThrow(() -> new ResourceNotFoundException("Empresa no encontrada"));
        Map<String, Object> params = clean(body.getType(), body.getParams(), org);
        if (repository.existsByTypeAndOrganizationIdAndStatus(body.getType(), org.getId(), Status.PENDING)) {
            throw new ConflictException("Ya hay una solicitud pendiente de este tipo para esta empresa");
        }
        PlatformRequest r = repository.save(PlatformRequest.builder()
            .type(body.getType()).organizationId(org.getId()).params(toJson(params))
            .reason(body.getReason().trim()).requestedBy(requester).build());
        auditService.record(requester, "REQUEST_CREATED", org.getId(), "#" + r.getId() + " " + r.getType());
        return row(r, org.getName());
    }

    // ───────────────────────────── Consultar ─────────────────────────────

    /** El dueño ve todas; el resto solo las suyas. */
    @Transactional(readOnly = true)
    public PageResponse<RequestDTO.Row> list(String viewer, boolean reviewer, Status status, Type type, Long organizationId, Pageable pageable) {
        LocalDateTime expiredBefore = LocalDateTime.now().minusDays(TTL_DAYS);
        Specification<PlatformRequest> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (!reviewer) ps.add(cb.equal(root.get("requestedBy"), viewer));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (type != null) ps.add(cb.equal(root.get("type"), type));
            if (organizationId != null) ps.add(cb.equal(root.get("organizationId"), organizationId));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        Page<PlatformRequest> page = repository.findAll(spec, pageable);
        Map<Long, String> names = organizationRepository.findAllById(
                page.getContent().stream().map(PlatformRequest::getOrganizationId).distinct().toList())
            .stream().collect(Collectors.toMap(Organization::getId, Organization::getName));
        return PageResponse.of(page.map(r -> row(r, names.get(r.getOrganizationId()))));
    }

    public long pendingCount() {
        return repository.countByStatus(Status.PENDING);
    }

    // ───────────────────────────── Decidir ─────────────────────────────

    /** El PIN del dueño ya se verificó antes de llamar. Ejecuta la acción y marca la solicitud como aprobada. */
    @Transactional
    public RequestDTO.Row approve(Long id, String approver, String note) {
        PlatformRequest r = pending(id);
        if (r.getCreatedAt().isBefore(LocalDateTime.now().minusDays(TTL_DAYS))) {
            throw new ConflictException("La solicitud venció (más de " + TTL_DAYS + " días); pide una nueva");
        }
        Map<String, Object> p = fromJson(r.getParams());
        String via = "solicitud #" + r.getId() + " de " + r.getRequestedBy()
            + (note == null || note.isBlank() ? "" : " · nota: " + note.trim());
        Long org = r.getOrganizationId();
        switch (r.getType()) {
            case SUSPEND -> actions.suspend(org, approver, via);
            case CANCEL -> actions.cancel(org, approver, via);
            case EXTEND_TRIAL -> actions.extendTrial(org, ((Number) p.get("days")).intValue(), approver, via);
            case CHANGE_PLAN -> actions.changePlan(org, (String) p.get("planCode"), cycle(p), (Boolean) p.get("complimentary"), approver, via);
            case MANUAL_PAYMENT -> actions.manualPayment(org, (String) p.get("planCode"), cycle(p), approver, via);
            case CHANGE_TAX_ID -> actions.changeTaxId(org, (String) p.get("taxId"), approver, via);
        }
        decide(r, Status.APPROVED, approver, note);
        auditService.record(approver, "REQUEST_APPROVED", org, "#" + r.getId() + " " + r.getType() + " de " + r.getRequestedBy());
        return row(r, name(org));
    }

    @Transactional
    public RequestDTO.Row reject(Long id, String reviewer, String note) {
        PlatformRequest r = pending(id);
        decide(r, Status.REJECTED, reviewer, note);
        auditService.record(reviewer, "REQUEST_REJECTED", r.getOrganizationId(), "#" + r.getId() + " " + r.getType() + " de " + r.getRequestedBy());
        return row(r, name(r.getOrganizationId()));
    }

    /** Solo quien la pidió, mientras siga pendiente. */
    @Transactional
    public RequestDTO.Row cancel(Long id, String requester) {
        PlatformRequest r = pending(id);
        if (!r.getRequestedBy().equals(requester)) {
            throw new ResourceNotFoundException("Solicitud no encontrada");   // la de otro se comporta como inexistente
        }
        decide(r, Status.CANCELLED, requester, null);
        auditService.record(requester, "REQUEST_CANCELLED", r.getOrganizationId(), "#" + r.getId() + " " + r.getType());
        return row(r, name(r.getOrganizationId()));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private PlatformRequest pending(Long id) {
        PlatformRequest r = repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Solicitud no encontrada"));
        if (r.getStatus() != Status.PENDING) {
            throw new ConflictException("La solicitud ya fue resuelta (" + r.getStatus() + ")");
        }
        return r;
    }

    private void decide(PlatformRequest r, Status status, String by, String note) {
        r.setStatus(status);
        r.setDecidedBy(by);
        r.setDecidedAt(LocalDateTime.now());
        r.setDecisionNote(note == null || note.isBlank() ? null : note.trim());
        repository.save(r);
    }

    /** Valida y deja solo los parámetros que corresponden al tipo. */
    private Map<String, Object> clean(Type type, Map<String, Object> in, Organization org) {
        Map<String, Object> p = in == null ? Map.of() : in;
        Map<String, Object> out = new LinkedHashMap<>();
        switch (type) {
            case SUSPEND, CANCEL -> { /* sin parámetros */ }
            case EXTEND_TRIAL -> {
                int days = intParam(p, "days", "Indica cuántos días");
                if (days < 1 || days > 90) throw new IllegalArgumentException("Los días deben estar entre 1 y 90");
                out.put("days", days);
            }
            case CHANGE_PLAN, MANUAL_PAYMENT -> {
                String code = str(p, "planCode");
                if (code == null || planRepository.findByCode(code).isEmpty()) throw new IllegalArgumentException("El plan indicado no existe");
                out.put("planCode", code);
                out.put("billingCycle", parseCycle(p.get("billingCycle")).name());
                if (type == Type.CHANGE_PLAN && p.get("complimentary") instanceof Boolean b) out.put("complimentary", b);
            }
            case CHANGE_TAX_ID -> {
                String raw = str(p, "taxId");
                if (raw == null || !raw.matches("^[A-Za-z0-9.\\-]{5,20}$")) {
                    throw new IllegalArgumentException("El NIT debe tener entre 5 y 20 caracteres (letras, números, punto o guion)");
                }
                String taxId = RegistrationService.normalizeTaxId(raw);
                if (taxId.equals(org.getTaxId())) throw new IllegalArgumentException("El NIT es el mismo que ya tiene la empresa");
                if (organizationRepository.existsByTaxId(taxId)) throw new ConflictException("Ya existe una empresa con el NIT " + taxId);
                out.put("taxId", taxId);
            }
        }
        return out;
    }

    private static int intParam(Map<String, Object> p, String key, String message) {
        if (!(p.get(key) instanceof Number n)) throw new IllegalArgumentException(message);
        return n.intValue();
    }

    private static String str(Map<String, Object> p, String key) {
        return p.get(key) instanceof String s && !s.isBlank() ? s.trim() : null;
    }

    private static Subscription.BillingCycle parseCycle(Object v) {
        if (v == null) return Subscription.BillingCycle.MONTHLY;
        try {
            return Subscription.BillingCycle.valueOf(String.valueOf(v));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("El ciclo debe ser MONTHLY o YEARLY");
        }
    }

    private static Subscription.BillingCycle cycle(Map<String, Object> p) {
        return parseCycle(p.get("billingCycle"));
    }

    private String toJson(Map<String, Object> m) {
        try {
            return mapper.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> fromJson(String json) {
        try {
            return json == null || json.isBlank() ? Map.of() : mapper.readValue(json, MAP);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Parámetros de la solicitud ilegibles", e);
        }
    }

    private String name(Long orgId) {
        return organizationRepository.findById(orgId).map(Organization::getName).orElse(null);
    }

    private RequestDTO.Row row(PlatformRequest r, String orgName) {
        boolean expired = r.getStatus() == Status.PENDING && r.getCreatedAt().isBefore(LocalDateTime.now().minusDays(TTL_DAYS));
        return new RequestDTO.Row(r.getId(), r.getType().name(), r.getOrganizationId(), orgName, fromJson(r.getParams()),
            r.getReason(), expired ? "EXPIRED" : r.getStatus().name(), r.getRequestedBy(), r.getCreatedAt(),
            r.getDecidedBy(), r.getDecidedAt(), r.getDecisionNote());
    }
}
