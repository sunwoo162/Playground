package com.playground.domain.voicephishing.service;

import com.playground.domain.voicephishing.dto.VoicePhishingDto;
import com.playground.domain.voicephishing.entity.VoicePhishingSession;
import com.playground.domain.voicephishing.repository.VoicePhishingSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class VoicePhishingService {
    private static final int MAX_DURATION_SECONDS = 60 * 60;

    private final VoicePhishingSessionRepository repository;

    @Transactional
    public VoicePhishingDto.SessionResponse create(String userId, VoicePhishingDto.CreateSessionRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("체험 결과가 비어 있습니다.");
        }

        List<String> incidents = normalizeIncidents(req.getIncidents());
        VoicePhishingSession session = repository.save(VoicePhishingSession.builder()
                .userId(userId)
                .riskScore(clamp(req.getRiskScore(), 0, 100))
                .choicesCount(clamp(req.getChoicesCount(), 0, 20))
                .riskyChoicesCount(incidents.size())
                .installedApp(incidents.contains("remote-app"))
                .transferredMoney(incidents.contains("transfer"))
                .sharedAuthCode(incidents.contains("auth-code"))
                .durationSeconds(clamp(req.getDurationSeconds(), 0, MAX_DURATION_SECONDS))
                .incidentSummary(String.join(",", incidents))
                .build());

        return toResponse(session);
    }

    @Transactional(readOnly = true)
    public List<VoicePhishingDto.SessionResponse> getRecent(String userId) {
        return repository.findTop10ByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    private List<String> normalizeIncidents(List<String> incidents) {
        if (incidents == null) return List.of();
        return incidents.stream()
                .filter(value -> value != null && (
                        value.equals("remote-app") ||
                        value.equals("transfer") ||
                        value.equals("auth-code")))
                .distinct()
                .toList();
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private VoicePhishingDto.SessionResponse toResponse(VoicePhishingSession session) {
        return VoicePhishingDto.SessionResponse.builder()
                .id(session.getId())
                .userId(session.getUserId())
                .riskScore(session.getRiskScore())
                .choicesCount(session.getChoicesCount())
                .riskyChoicesCount(session.getRiskyChoicesCount())
                .installedApp(session.isInstalledApp())
                .transferredMoney(session.isTransferredMoney())
                .sharedAuthCode(session.isSharedAuthCode())
                .durationSeconds(session.getDurationSeconds())
                .incidentSummary(session.getIncidentSummary())
                .createdAt(session.getCreatedAt())
                .build();
    }
}
