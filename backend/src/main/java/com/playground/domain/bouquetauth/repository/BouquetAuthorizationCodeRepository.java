package com.playground.domain.bouquetauth.repository;

import com.playground.domain.bouquetauth.entity.BouquetAuthorizationCode;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BouquetAuthorizationCodeRepository extends JpaRepository<BouquetAuthorizationCode, String> {
}
