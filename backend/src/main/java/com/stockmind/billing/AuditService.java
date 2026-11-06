package com.stockmind.billing;

import com.stockmind.model.AuditLog;
import com.stockmind.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/** Registra acciones sensibles en la tabla audit_log y en el log. Nunca incluir secretos en `details`. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public void record(String actorEmail, String action, Long organizationId, String details) {
        String safe = details == null ? null : (details.length() > 500 ? details.substring(0, 500) : details);
        auditLogRepository.save(AuditLog.builder()
            .actorEmail(actorEmail).action(action).organizationId(organizationId).details(safe).build());
        log.info("AUDIT {} por {} sobre la empresa {}: {}", action, actorEmail, organizationId, safe);
    }
}
