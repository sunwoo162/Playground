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
import java.time.format.DateTimeParseException;
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
        validateRequest(req);
        CodingLog log = CodingLog.builder()
                .userId(userId)
                .platform(parsePlatform(req.getPlatform()))
                .problemTitle(clean(req.getProblemTitle(), 180))
                .problemNumber(clean(req.getProblemNumber(), 64))
                .level(clean(req.getLevel(), 64))
                .status(parseStatus(req.getStatus()))
                .language(clean(req.getLanguage(), 32))
                .approach(cleanText(req.getApproach()))
                .code(cleanText(req.getCode()))
                .timeComplexity(clean(req.getTimeComplexity(), 64))
                .tags(cleanText(req.getTags()))
                .date(parseDate(req.getDate(), LocalDate.now()))
                .isPublic(req.isPublic())
                .build();
        return toResponse(codingLogRepository.save(log), userId);
    }

    // 수정
    @Transactional
    public CodingLogDto.Response update(Long id, String userId, CodingLogDto.Request req) {
        validateRequest(req);
        CodingLog log = codingLogRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("일지를 찾을 수 없습니다."));
        log.setPlatform(parsePlatform(req.getPlatform()));
        log.setProblemTitle(clean(req.getProblemTitle(), 180));
        log.setProblemNumber(clean(req.getProblemNumber(), 64));
        log.setLevel(clean(req.getLevel(), 64));
        log.setStatus(parseStatus(req.getStatus()));
        log.setLanguage(clean(req.getLanguage(), 32));
        log.setApproach(cleanText(req.getApproach()));
        log.setCode(cleanText(req.getCode()));
        log.setTimeComplexity(clean(req.getTimeComplexity(), 64));
        log.setTags(cleanText(req.getTags()));
        log.setDate(parseDate(req.getDate(), log.getDate()));
        log.setPublic(req.isPublic());
        return toResponse(log, userId);
    }

    // 삭제
    @Transactional
    public void delete(Long id, String userId) {
        CodingLog log = codingLogRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("일지를 찾을 수 없습니다."));
        codingLogRepository.delete(log);
    }

    private void validateRequest(CodingLogDto.Request req) {
        if (req == null) {
            throw new IllegalArgumentException("요청 본문이 필요합니다.");
        }
        if (clean(req.getProblemTitle(), 180).isBlank()) {
            throw new IllegalArgumentException("문제 제목을 입력해주세요.");
        }
    }

    private CodingLog.Platform parsePlatform(String platform) {
        try {
            return CodingLog.Platform.valueOf(clean(platform, 32));
        } catch (Exception e) {
            throw new IllegalArgumentException("지원하지 않는 플랫폼입니다.");
        }
    }

    private CodingLog.Status parseStatus(String status) {
        try {
            return CodingLog.Status.valueOf(clean(status, 32));
        } catch (Exception e) {
            throw new IllegalArgumentException("지원하지 않는 풀이 상태입니다.");
        }
    }

    private LocalDate parseDate(String value, LocalDate fallback) {
        String cleaned = clean(value, 32);
        if (cleaned.isBlank()) return fallback;
        try {
            return LocalDate.parse(cleaned);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("날짜는 YYYY-MM-DD 형식이어야 합니다.");
        }
    }

    private String clean(String value, int maxLength) {
        String cleaned = value == null ? "" : value.trim();
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength);
    }

    private String cleanText(String value) {
        return value == null ? "" : value.trim();
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
                .language(l.getLanguage())
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
