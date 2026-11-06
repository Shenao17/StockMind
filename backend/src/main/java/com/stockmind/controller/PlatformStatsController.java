package com.stockmind.controller;

import com.stockmind.dto.PageResponse;
import com.stockmind.dto.PlatformStatsDTO;
import com.stockmind.model.AuditLog;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Subscription;
import com.stockmind.platform.PlatformPermission;
import com.stockmind.repository.AuditLogRepository;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PaymentRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.repository.spec.AuditSpecs;
import com.stockmind.repository.spec.PaymentSpecs;
import com.stockmind.util.Paging;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * PlatformStatsController — Resumen, cobros y auditoría del panel de plataforma.
 *
 * GET /platform/summary   → métricas del negocio (ORG_VIEW; los ingresos solo con PAYMENT_VIEW)
 * GET /platform/payments  → cobros de todas las empresas, filtrables y paginados (PAYMENT_VIEW)
 * GET /platform/audit     → auditoría, filtrable y paginada (AUDIT_VIEW)
 *
 * Son datos de operación de la cuenta (estados, planes, cobros, acciones del equipo): nunca datos de
 * negocio de las empresas (productos, ventas, clientes).
 */
@RestController
@RequestMapping("/platform")
@RequiredArgsConstructor
public class PlatformStatsController {

    private static final Set<String> PAYMENT_SORT = Set.of("id", "createdAt", "paidAt", "amountTotal");
    private static final Set<String> AUDIT_SORT = Set.of("id", "createdAt", "action");
    private static final int LIST_LIMIT = 10;

    private final OrganizationRepository organizationRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PaymentRepository paymentRepository;
    private final AuditLogRepository auditLogRepository;
    private final EntityManager em;

    /** Mismo umbral del ciclo diario (SubscriptionLifecycleService): a ≤ 5 días del fin se avisa al cliente. */
    private static final int TRIAL_WARNING_DAYS = 5;

    // ───────────────────────────── Resumen ─────────────────────────────

    @GetMapping("/summary")
    public ResponseEntity<PlatformStatsDTO.Summary> summary(Authentication auth) {
        LocalDateTime now = LocalDateTime.now();

        Map<String, Long> orgs = zeroed(Organization.Status.values());
        organizationRepository.countByStatus().forEach(r -> orgs.put(r[0].toString(), (Long) r[1]));

        Map<String, Long> subs = zeroed(Subscription.Status.values());
        subscriptionRepository.countByStatus().forEach(r -> subs.put(r[0].toString(), (Long) r[1]));

        Map<String, Long> plans = new LinkedHashMap<>();
        subscriptionRepository.countByPlan(List.of(Subscription.Status.TRIAL, Subscription.Status.ACTIVE, Subscription.Status.GRACE))
            .forEach(r -> plans.put(r[0].toString(), (Long) r[1]));

        List<Subscription> trials = subscriptionRepository.findByStatusAndTrialEndsAtLessThanEqualOrderByTrialEndsAtAsc(
            Subscription.Status.TRIAL, now.plusDays(TRIAL_WARNING_DAYS), PageRequest.of(0, LIST_LIMIT));
        List<Subscription> grace = subscriptionRepository.findByStatusOrderByGraceEndsAtAsc(
            Subscription.Status.GRACE, PageRequest.of(0, LIST_LIMIT));
        Map<Long, String> names = names(concat(trials, grace));

        List<PlatformStatsDTO.TrialRow> trialRows = trials.stream().map(s -> new PlatformStatsDTO.TrialRow(
            s.getOrganizationId(), names.get(s.getOrganizationId()), s.getPlan().getName(), s.getTrialEndsAt(),
            Math.max(0, (long) Math.ceil(Duration.between(now, s.getTrialEndsAt()).toMinutes() / (60.0 * 24))))).toList();
        List<PlatformStatsDTO.GraceRow> graceRows = grace.stream().map(s -> new PlatformStatsDTO.GraceRow(
            s.getOrganizationId(), names.get(s.getOrganizationId()), s.getPlan().getName(), s.getGraceEndsAt())).toList();

        PlatformStatsDTO.Revenue revenue = has(auth, PlatformPermission.PAYMENT_VIEW) ? revenue(now) : null;

        return ResponseEntity.ok(new PlatformStatsDTO.Summary(orgs, subs, subscriptionRepository.countByComplimentaryTrue(),
            plans, organizationRepository.countByCreatedAtGreaterThanEqual(now.minusDays(30)), TRIAL_WARNING_DAYS,
            trialRows, graceRows, revenue));
    }

    private PlatformStatsDTO.Revenue revenue(LocalDateTime now) {
        LocalDateTime monthStart = now.toLocalDate().withDayOfMonth(1).atStartOfDay();
        LocalDateTime prevMonthStart = monthStart.minusMonths(1);
        long mrr = subscriptionRepository.sumMonthlyPrices(Subscription.Status.ACTIVE, Subscription.BillingCycle.MONTHLY)
            + Math.round(subscriptionRepository.sumYearlyPrices(Subscription.Status.ACTIVE, Subscription.BillingCycle.YEARLY) / 12.0);
        Object[] pending = paymentRepository.pendingSince(Payment.Status.PENDING, now).get(0);
        return new PlatformStatsDTO.Revenue(paid(monthStart, now.plusSeconds(1)), paid(prevMonthStart, monthStart), mrr,
            (Long) pending[0], ((Number) pending[1]).longValue(),
            paymentRepository.countByStatusAndCreatedAtGreaterThanEqual(Payment.Status.FAILED, now.minusDays(30)));
    }

    private PlatformStatsDTO.Money paid(LocalDateTime from, LocalDateTime to) {
        Object[] r = paymentRepository.paidBetween(Payment.Status.PAID, from, to).get(0);
        return new PlatformStatsDTO.Money(((Number) r[0]).longValue(), ((Number) r[1]).longValue(),
            ((Number) r[2]).longValue(), ((Number) r[3]).longValue());
    }

    // ───────────────────────────── Cobros ─────────────────────────────

    @GetMapping("/payments")
    public ResponseEntity<PlatformStatsDTO.PaymentsPage> payments(
            @RequestParam(required = false) Payment.Status status,
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort, @RequestParam(required = false) String dir) {

        LocalDateTime now = LocalDateTime.now();
        List<Long> orgIds = null;
        if (search != null && !search.isBlank()) {
            orgIds = matchingOrganizations(search);
        }
        Specification<Payment> spec = PaymentSpecs.filter(status, organizationId, orgIds, from, to, now);
        Pageable pageable = Paging.of(page, size, sort, dir, PAYMENT_SORT, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<Payment> result = paymentRepository.findAll(spec, pageable);

        Map<Long, String> names = names(result.getContent().stream().map(Payment::getOrganizationId).toList());
        Page<PlatformStatsDTO.PaymentRow> rows = result.map(p ->
            PlatformStatsDTO.PaymentRow.of(p, names.get(p.getOrganizationId()), now));
        return ResponseEntity.ok(new PlatformStatsDTO.PaymentsPage(PageResponse.of(rows), paidTotals(spec)));
    }

    /** Suma de lo PAGADO dentro del filtro, sobre todas las páginas. */
    private PlatformStatsDTO.PaymentTotals paidTotals(Specification<Payment> spec) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Object[]> q = cb.createQuery(Object[].class);
        Root<Payment> r = q.from(Payment.class);
        q.multiselect(cb.coalesce(cb.sum(r.<Long>get("amountNet")), 0L), cb.coalesce(cb.sum(r.<Long>get("ivaAmount")), 0L),
            cb.coalesce(cb.sum(r.<Long>get("amountTotal")), 0L), cb.count(r));
        q.where(spec.toPredicate(r, q, cb), cb.equal(r.get("status"), Payment.Status.PAID));
        Object[] t = em.createQuery(q).getSingleResult();
        return new PlatformStatsDTO.PaymentTotals(((Number) t[0]).longValue(), ((Number) t[1]).longValue(),
            ((Number) t[2]).longValue(), ((Number) t[3]).longValue());
    }

    // ───────────────────────────── Auditoría ─────────────────────────────

    @GetMapping("/audit")
    public ResponseEntity<PageResponse<PlatformStatsDTO.AuditRow>> audit(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort, @RequestParam(required = false) String dir) {

        Pageable pageable = Paging.of(page, size, sort, dir, AUDIT_SORT, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<AuditLog> result = auditLogRepository.findAll(AuditSpecs.filter(action, actor, organizationId, from, to), pageable);
        Map<Long, String> names = names(result.getContent().stream().map(AuditLog::getOrganizationId).toList());
        return ResponseEntity.ok(PageResponse.of(result.map(a ->
            PlatformStatsDTO.AuditRow.of(a, a.getOrganizationId() == null ? null : names.get(a.getOrganizationId())))));
    }

    // ───────────────────────────── Internos ─────────────────────────────

    private List<Long> matchingOrganizations(String search) {
        String like = Paging.likePattern(search);
        return organizationRepository.findAll((root, query, cb) -> cb.or(
                cb.like(cb.lower(root.get("name")), like, '!'),
                cb.like(cb.lower(root.get("taxId")), like, '!'),
                cb.like(cb.lower(root.get("contactEmail")), like, '!')),
            PageRequest.of(0, 500)).map(Organization::getId).getContent();
    }

    private Map<Long, String> names(List<Long> ids) {
        List<Long> distinct = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (distinct.isEmpty()) return Map.of();
        return organizationRepository.findAllById(distinct).stream()
            .collect(Collectors.toMap(Organization::getId, Organization::getName));
    }

    private static List<Long> concat(List<Subscription> a, List<Subscription> b) {
        List<Long> ids = new ArrayList<>(a.stream().map(Subscription::getOrganizationId).toList());
        ids.addAll(b.stream().map(Subscription::getOrganizationId).toList());
        return ids;
    }

    private static <E extends Enum<E>> Map<String, Long> zeroed(E[] values) {
        Map<String, Long> m = new LinkedHashMap<>();
        for (E v : values) m.put(v.name(), 0L);
        return m;
    }

    private static boolean has(Authentication auth, PlatformPermission p) {
        return auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals(p.authority()));
    }
}
