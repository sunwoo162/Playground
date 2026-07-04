package com.playground.domain.codinglog.service;

import com.playground.domain.codinglog.dto.CodingLogDto;
import com.playground.domain.codinglog.entity.CodingLog;
import com.playground.domain.codinglog.repository.CodingLogRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CodingLogService {

    private final CodingLogRepository codingLogRepository;
    private final UserRepository userRepository;

    // 내 로그 목록
    public List<CodingLogDto.Response> getMyLogs(String userId) {
        return codingLogRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().map(l -> toResponse(l, userId)).collect(Collectors.toList());
    }

    // 공개 로그 전체 (커뮤니티)
    public List<CodingLogDto.Response> getPublicLogs(String userId) {
        return codingLogRepository.findByIsPublicTrueOrderByCreatedAtDesc()
                .stream().map(l -> toResponse(l, userId)).collect(Collectors.toList());
    }

    // 생성
    @Transactional
    public CodingLogDto.Response create(String userId, CodingLogDto.Request req) {
        CodingLog log = CodingLog.builder()
                .userId(userId)
                .platform(CodingLog.Platform.valueOf(req.getPlatform()))
                .problemTitle(req.getProblemTitle())
                .problemNumber(req.getProblemNumber())
                .level(req.getLevel())
                .status(CodingLog.Status.valueOf(req.getStatus()))
                .approach(req.getApproach())
                .code(req.getCode())
                .timeComplexity(req.getTimeComplexity())
                .tags(req.getTags())
                .date(req.getDate() != null ? LocalDate.parse(req.getDate()) : LocalDate.now())
                .isPublic(req.isPublic())
                .build();
        return toResponse(codingLogRepository.save(log), userId);
    }

    // 수정
    @Transactional
    public CodingLogDto.Response update(Long id, String userId, CodingLogDto.Request req) {
        CodingLog log = codingLogRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Not found"));
        log.setPlatform(CodingLog.Platform.valueOf(req.getPlatform()));
        log.setProblemTitle(req.getProblemTitle());
        log.setProblemNumber(req.getProblemNumber());
        log.setLevel(req.getLevel());
        log.setStatus(CodingLog.Status.valueOf(req.getStatus()));
        log.setApproach(req.getApproach());
        log.setCode(req.getCode());
        log.setTimeComplexity(req.getTimeComplexity());
        log.setTags(req.getTags());
        log.setDate(req.getDate() != null ? LocalDate.parse(req.getDate()) : log.getDate());
        log.setPublic(req.isPublic());
        return toResponse(log, userId);
    }

    // 삭제
    @Transactional
    public void delete(Long id, String userId) {
        CodingLog log = codingLogRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Not found"));
        codingLogRepository.delete(log);
    }

    private CodingLogDto.Response toResponse(CodingLog l, String currentUserId) {
        User user = userRepository.findById(l.getUserId()).orElse(null);
        return CodingLogDto.Response.builder()
                .id(l.getId())
                .userId(l.getUserId())
                .userLogin(user != null ? user.getLogin() : l.getUserId())
                .userAvatarUrl(user != null ? user.getAvatarUrl() : null)
                .platform(l.getPlatform().name())
                .problemTitle(l.getProblemTitle())
                .problemNumber(l.getProblemNumber())
                .level(l.getLevel())
                .status(l.getStatus().name())
                .approach(l.getApproach())
                .code(l.getCode())
                .timeComplexity(l.getTimeComplexity())
                .tags(l.getTags())
                .date(l.getDate().toString())
                .isPublic(l.isPublic())
                .createdAt(l.getCreatedAt())
                .updatedAt(l.getUpdatedAt())
                .build();
    }
}
