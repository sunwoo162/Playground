package com.playground.domain.bouquetauth.repository;

import com.playground.domain.bouquetauth.entity.BouquetAuthorizationCode;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface BouquetAuthorizationCodeRepository extends JpaRepository<BouquetAuthorizationCode, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select code from BouquetAuthorizationCode code where code.codeHash = :codeHash")
    Optional<BouquetAuthorizationCode> findByCodeHashForUpdate(@Param("codeHash") String codeHash);
}
