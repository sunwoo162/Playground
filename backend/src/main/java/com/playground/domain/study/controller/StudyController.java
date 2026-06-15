package com.playground.domain.study.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.study.dto.StudyDto;
import com.playground.domain.study.service.StudyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/study")
@RequiredArgsConstructor
public class StudyController {

    private final StudyService studyService;

    // ── Subjects ──────────────────────────────────────
    @GetMapping("/subjects")
    public ResponseEntity<List<StudyDto.SubjectResponse>> getSubjects(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.getSubjects(auth.getUserId()));
    }

    @PostMapping("/subjects")
    public ResponseEntity<StudyDto.SubjectResponse> createSubject(
            @RequestBody StudyDto.SubjectRequest req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.createSubject(auth.getUserId(), req));
    }

    @PutMapping("/subjects/{id}")
    public ResponseEntity<StudyDto.SubjectResponse> updateSubject(
            @PathVariable Long id,
            @RequestBody StudyDto.SubjectRequest req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.updateSubject(id, auth.getUserId(), req));
    }

    @DeleteMapping("/subjects/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteSubject(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        studyService.deleteSubject(id, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Sessions ──────────────────────────────────────
    @GetMapping("/sessions")
    public ResponseEntity<List<StudyDto.SessionResponse>> getSessions(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.getSessions(auth.getUserId()));
    }

    @PostMapping("/sessions")
    public ResponseEntity<StudyDto.SessionResponse> createSession(
            @RequestBody StudyDto.SessionRequest req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.createSession(auth.getUserId(), req));
    }

    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteSession(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        studyService.deleteSession(id, auth.getUserId());
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Daily Goal ────────────────────────────────────
    @GetMapping("/goal")
    public ResponseEntity<StudyDto.GoalResponse> getGoal(
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.getGoal(auth.getUserId()));
    }

    @PutMapping("/goal")
    public ResponseEntity<StudyDto.GoalResponse> saveGoal(
            @RequestBody StudyDto.GoalRequest req,
            @AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(studyService.saveGoal(auth.getUserId(), req));
    }
}
