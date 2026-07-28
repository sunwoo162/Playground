package com.playground.domain.voicephishing.repository;

import com.playground.domain.voicephishing.entity.VoicePhishingSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VoicePhishingSessionRepository extends JpaRepository<VoicePhishingSession, Long> {
    List<VoicePhishingSession> findTop10ByUserIdOrderByCreatedAtDesc(String userId);
}
