package com.playground.domain.study.service;

import com.playground.domain.study.dto.StudyDto;
import com.playground.domain.study.entity.DailyGoal;
import com.playground.domain.study.entity.StudySession;
import com.playground.domain.study.entity.Subject;
import com.playground.domain.study.repository.DailyGoalRepository;
import com.playground.domain.study.repository.StudySessionRepository;
import com.playground.domain.study.repository.SubjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudyService {

    private final SubjectRepository subjectRepository;
    private final StudySessionRepository sessionRepository;
    private final DailyGoalRepository goalRepository;

    // ── Subject ──────────────────────────────────────
    public List<StudyDto.SubjectResponse> getSubjects(String userId) {
        requireUserId(userId);
        return subjectRepository.findByUserIdOrderById(userId)
                .stream().map(this::toSubjectResponse).collect(Collectors.toList());
    }

    @Transactional
    public StudyDto.SubjectResponse createSubject(String userId, StudyDto.SubjectRequest req) {
        validateSubject(userId, req);
        Subject subject = Subject.builder()
                .userId(userId)
                .name(clean(req.getName(), 120))
                .color(clean(req.getColor(), 24))
                .dailyGoalMinutes(clamp(req.getDailyGoalMinutes(), 0, 1440))
                .build();
        return toSubjectResponse(subjectRepository.save(subject));
    }

    @Transactional
    public StudyDto.SubjectResponse updateSubject(Long id, String userId, StudyDto.SubjectRequest req) {
        validateSubject(userId, req);
        Subject subject = subjectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Subject not found"));
        subject.setName(clean(req.getName(), 120));
        subject.setColor(clean(req.getColor(), 24));
        subject.setDailyGoalMinutes(clamp(req.getDailyGoalMinutes(), 0, 1440));
        return toSubjectResponse(subject);
    }

    @Transactional
    public void deleteSubject(Long id, String userId) {
        requireUserId(userId);
        Subject subject = subjectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Subject not found"));
        subjectRepository.delete(subject);
    }

    // ── Session ──────────────────────────────────────
    public List<StudyDto.SessionResponse> getSessions(String userId) {
        requireUserId(userId);
        return sessionRepository.findByUserIdOrderByStartTimeDesc(userId)
                .stream().map(this::toSessionResponse).collect(Collectors.toList());
    }

    @Transactional
    public StudyDto.SessionResponse createSession(String userId, StudyDto.SessionRequest req) {
        validateSession(userId, req);
        StudySession session = StudySession.builder()
                .userId(userId)
                .subjectId(req.getSubjectId())
                .date(parseDate(req.getDate()))
                .startTime(req.getStartTime() != null ? parseDateTime(req.getStartTime()) : null)
                .endTime(req.getEndTime() != null ? parseDateTime(req.getEndTime()) : null)
                .durationSeconds(clamp(req.getDurationSeconds(), 0, 86_400))
                .durationMinutes(clamp(req.getDurationMinutes(), 0, 1_440))
                .memo(cleanNullable(req.getMemo(), 1000))
                .build();
        return toSessionResponse(sessionRepository.save(session));
    }

    private LocalDateTime parseDateTime(String s) {
        try {
            // ISO 8601 with Z suffix (e.g. 2026-07-02T02:06:33.669Z)
            return Instant.parse(s).atOffset(ZoneOffset.UTC).toLocalDateTime();
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(s);
            } catch (DateTimeParseException parseException) {
                throw new IllegalArgumentException("시간 형식이 올바르지 않습니다.");
            }
        }
    }

    @Transactional
    public void deleteSession(Long id, String userId) {
        requireUserId(userId);
        sessionRepository.deleteByIdAndUserId(id, userId);
    }

    // ── Daily Goal ────────────────────────────────────
    public StudyDto.GoalResponse getGoal(String userId) {
        requireUserId(userId);
        return goalRepository.findById(userId)
                .map(g -> StudyDto.GoalResponse.builder().totalMinutes(g.getTotalMinutes()).build())
                .orElse(StudyDto.GoalResponse.builder().totalMinutes(480).build());
    }

    @Transactional
    public StudyDto.GoalResponse saveGoal(String userId, StudyDto.GoalRequest req) {
        requireUserId(userId);
        if (req == null) {
            throw new IllegalArgumentException("목표 시간이 필요합니다.");
        }
        DailyGoal goal = goalRepository.findById(userId)
                .orElse(DailyGoal.builder().userId(userId).build());
        goal.setTotalMinutes(clamp(req.getTotalMinutes(), 0, 1440));
        return StudyDto.GoalResponse.builder()
                .totalMinutes(goalRepository.save(goal).getTotalMinutes())
                .build();
    }

    // ── 변환 ──────────────────────────────────────────
    private StudyDto.SubjectResponse toSubjectResponse(Subject s) {
        return StudyDto.SubjectResponse.builder()
                .id(s.getId()).name(s.getName())
                .color(s.getColor()).dailyGoalMinutes(s.getDailyGoalMinutes())
                .build();
    }

    private StudyDto.SessionResponse toSessionResponse(StudySession s) {
        return StudyDto.SessionResponse.builder()
                .id(s.getId()).subjectId(s.getSubjectId())
                .date(s.getDate().toString())
                .startTime(s.getStartTime() != null ? s.getStartTime().toString() : null)
                .endTime(s.getEndTime() != null ? s.getEndTime().toString() : null)
                .durationSeconds(s.getDurationSeconds())
                .durationMinutes(s.getDurationMinutes())
                .memo(s.getMemo())
                .build();
    }

    private void validateSubject(String userId, StudyDto.SubjectRequest req) {
        requireUserId(userId);
        if (req == null || req.getName() == null || req.getName().isBlank()) {
            throw new IllegalArgumentException("과목명을 입력해주세요.");
        }
        if (req.getColor() == null || req.getColor().isBlank()) {
            throw new IllegalArgumentException("과목 색상을 선택해주세요.");
        }
    }

    private void validateSession(String userId, StudyDto.SessionRequest req) {
        requireUserId(userId);
        if (req == null) {
            throw new IllegalArgumentException("공부 기록이 필요합니다.");
        }
        if (req.getSubjectId() == null || subjectRepository.findByIdAndUserId(req.getSubjectId(), userId).isEmpty()) {
            throw new IllegalArgumentException("과목을 찾을 수 없습니다.");
        }
        parseDate(req.getDate());
    }

    private void requireUserId(String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("사용자 정보가 필요합니다.");
        }
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(clean(value, 10));
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("날짜는 YYYY-MM-DD 형식이어야 합니다.");
        }
    }

    private String clean(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("필수 입력값이 비어 있습니다.");
        }
        String cleaned = value.trim();
        return cleaned.length() > maxLength ? cleaned.substring(0, maxLength) : cleaned;
    }

    private String cleanNullable(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String cleaned = value.trim();
        return cleaned.length() > maxLength ? cleaned.substring(0, maxLength) : cleaned;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
