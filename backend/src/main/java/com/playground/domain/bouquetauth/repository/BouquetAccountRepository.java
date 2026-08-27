package com.playground.domain.bouquetauth.repository;

import com.playground.domain.bouquetauth.entity.BouquetAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BouquetAccountRepository extends JpaRepository<BouquetAccount, String> {
    Optional<BouquetAccount> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
}
