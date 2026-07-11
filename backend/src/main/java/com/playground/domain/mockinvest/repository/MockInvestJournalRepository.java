package com.playground.domain.mockinvest.repository;

import com.playground.domain.mockinvest.entity.MockInvestJournal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MockInvestJournalRepository extends JpaRepository<MockInvestJournal, Long> {
    List<MockInvestJournal> findByUserIdOrderByCreatedAtDesc(String userId);
    Optional<MockInvestJournal> findByIdAndUserId(Long id, String userId);
}
