package com.playground.config;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

public final class BouquetAuthenticationToken extends AbstractAuthenticationToken {
    private final String accountId;
    private final String email;
    private final String displayName;

    public BouquetAuthenticationToken(String accountId, String email, String displayName) {
        super(List.of(new SimpleGrantedAuthority("ROLE_BOUQUET_USER")));
        this.accountId = accountId;
        this.email = email;
        this.displayName = displayName;
        setAuthenticated(true);
    }

    public String getAccountId() {
        return accountId;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return this;
    }

    @Override
    public String getName() {
        return accountId;
    }
}
