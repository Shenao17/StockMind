package com.stockmind.tenant;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

/**
 * Le dice a Hibernate cuál es la empresa actual. Con @TenantId en las entidades,
 * Hibernate añade "organization_id = ?" a cada consulta (HQL, criteria, findById...)
 * y rellena la columna al insertar. Sin empresa devuelve NO_TENANT, que no existe en la
 * base: las lecturas devuelven vacío y las escrituras fallan (nunca se mezclan datos).
 */
@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<Long> {

    @Override
    public Long resolveCurrentTenantIdentifier() {
        Long id = TenantContext.get();
        return id != null ? id : TenantContext.NO_TENANT;
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }

    @Configuration
    static class HibernateTenantConfig {
        @Bean
        HibernatePropertiesCustomizer tenantResolverCustomizer(TenantIdentifierResolver resolver) {
            return props -> props.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, resolver);
        }
    }
}
