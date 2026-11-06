package com.stockmind.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class TestEmailConfig {

    @Bean
    @Primary
    public CapturingEmailSender capturingEmailSender() {
        return new CapturingEmailSender();
    }
}
