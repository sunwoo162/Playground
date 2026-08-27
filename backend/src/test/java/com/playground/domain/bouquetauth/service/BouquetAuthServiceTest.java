package com.playground.domain.bouquetauth.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BouquetAuthServiceTest {

    @Test
    void createsRfc7636S256Challenge() {
        String verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assertEquals(
                "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
                BouquetAuthService.pkceChallenge(verifier)
        );
    }
}
