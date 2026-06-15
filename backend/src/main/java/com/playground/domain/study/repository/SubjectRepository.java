package com.playground.domain.study.repository;

import com.playground.domain.study.entity.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SubjectRepository extends JpaRepository<Subject, Long> {
    List<Subject> findByUserIdOrderById(String userId);
    java.util.Optional<Subject> findByIdAndUserId(Long id, String userId);
}
