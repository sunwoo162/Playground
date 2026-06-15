package com.playground.domain.study.repository;

import com.playground.domain.study.entity.StudySession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StudySessionRepository extends JpaRepository<StudySession, Long> {
    List<StudySession> findByUserIdOrderByStartTimeDesc(String userId);
    void deleteByIdAndUserId(Long id, String userId);
}
