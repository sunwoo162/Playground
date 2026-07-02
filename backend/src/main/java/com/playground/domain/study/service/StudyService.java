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
        return subjectRepository.findByUserIdOrderById(userId)
                .stream().map(this::toSubjectResponse).collect(Collectors.toList());
    }

    @Transactional
    public StudyDto.SubjectResponse createSubject(String userId, StudyDto.SubjectRequest req) {
        Subject subject = Subject.builder()
                .userId(userId)
                .name(req.getName())
                .color(req.getColor())
                .dailyGoalMinutes(req.getDailyGoalMinutes())
                .build();
        return toSubjectResponse(subjectRepository.save(subject));
    }

    @Transactional
    public StudyDto.SubjectResponse updateSubject(Long id, String userId, StudyDto.SubjectRequest req) {
        Subject subject = subjectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Subject not found"));
        subject.setName(req.getName());
        subject.setColor(req.getColor());
        subject.setDailyGoalMinutes(req.getDailyGoalMinutes());
        return toSubjectResponse(subject);
    }

    @Transactional
    public void deleteSubject(Long id, String userId) {
        Subject subject = subjectRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new RuntimeException("Subject not found"));
        subjectRepository.delete(subject);
    }

    // ── Session ──────────────────────────────────────
    public List<StudyDto.SessionResponse> getSessions(String userId) {
        return sessionRepository.findByUserIdOrderByStartTimeDesc(userId)
                .stream().map(this::toSessionResponse).collect(Collectors.toList());
    }

    @Transactional
    public StudyDto.SessionResponse createSession(String userId, StudyDto.SessionRequest req) {
        StudySession session = StudySession.builder()
                .userId(userId)
                .subjectId(req.getSubjectId())
                .date(LocalDate.parse(req.getDate()))
                .startTime(req.getStartTime() != null ? parseDateTime(req.getStartTime()) : null)
                .endTime(req.getEndTime() != null ? parseDateTime(req.getEndTime()) : null)
                .durationSeconds(req.getDurationSeconds())
                .durationMinutes(req.getDurationMinutes())
                .memo(req.getMemo())
                .build();
        return toSessionResponse(sessionRepository.save(session));
    }

    private LocalDateTime parseDateTime(String s) {
        try {
            // ISO 8601 with Z suffix (e.g. 2026-07-02T02:06:33.669Z)
            return Instant.parse(s).atOffset(ZoneOffset.UTC).toLocalDateTime();
        } catch (Exception e) {
            return LocalDateTime.parse(s);
        }
    }

    @Transactional
    public void deleteSession(Long id, String userId) {
        sessionRepository.deleteByIdAndUserId(id, userId);
    }

    // ── Daily Goal ────────────────────────────────────
    public StudyDto.GoalResponse getGoal(String userId) {
        return goalRepository.findById(userId)
                .map(g -> StudyDto.GoalResponse.builder().totalMinutes(g.getTotalMinutes()).build())
                .orElse(StudyDto.GoalResponse.builder().totalMinutes(480).build());
    }

    @Transactional
    public StudyDto.GoalResponse saveGoal(String userId, StudyDto.GoalRequest req) {
        DailyGoal goal = goalRepository.findById(userId)
                .orElse(DailyGoal.builder().userId(userId).build());
        goal.setTotalMinutes(req.getTotalMinutes());
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
}
