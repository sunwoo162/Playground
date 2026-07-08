package com.playground.domain.study.service;

import com.playground.domain.study.entity.StudyGroup;
import com.playground.domain.study.entity.StudyGroupMember;
import com.playground.domain.study.entity.StudySession;
import com.playground.domain.study.repository.StudyGroupRepository;
import com.playground.domain.study.repository.StudySessionRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudyGroupService {

    private final StudyGroupRepository groupRepo;
    private final StudySessionRepository sessionRepo;
    private final UserRepository userRepo;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    // 내 그룹 목록
    public List<Map<String, Object>> getMyGroups(String userId) {
        return groupRepo.findByMemberOrOwner(userId).stream()
            .map(g -> toGroupMap(g, userId))
            .collect(Collectors.toList());
    }

    // 그룹 생성
    @Transactional
    public Map<String, Object> createGroup(String userId, String name, String description) {
        StudyGroup group = StudyGroup.builder()
            .name(name)
            .description(description)
            .ownerId(userId)
            .build();
        // 생성자도 멤버로 추가
        StudyGroupMember ownerMember = StudyGroupMember.builder()
            .group(group)
            .userId(userId)
            .build();
        group.getMembers().add(ownerMember);
        return toGroupMap(groupRepo.save(group), userId);
    }

    // 멤버 초대
    @Transactional
    public void inviteMember(Long groupId, String ownerId, String targetUserId) {
        StudyGroup group = groupRepo.findById(groupId)
            .orElseThrow(() -> new RuntimeException("그룹을 찾을 수 없어요"));
        if (!group.getOwnerId().equals(ownerId))
            throw new IllegalArgumentException("그룹 소유자만 초대할 수 있어요");
        boolean alreadyMember = group.getMembers().stream()
            .anyMatch(m -> m.getUserId().equals(targetUserId));
        if (alreadyMember) throw new IllegalStateException("이미 멤버예요");

        userRepo.findById(targetUserId)
            .orElseThrow(() -> new RuntimeException("존재하지 않는 유저예요"));

        group.getMembers().add(StudyGroupMember.builder().group(group).userId(targetUserId).build());
        groupRepo.save(group);
        sendInviteNotification(group, ownerId, targetUserId);
    }

    // 그룹 탈퇴
    @Transactional
    public void leaveGroup(Long groupId, String userId) {
        StudyGroup group = groupRepo.findById(groupId)
            .orElseThrow(() -> new RuntimeException("그룹을 찾을 수 없어요"));
        if (group.getOwnerId().equals(userId)) {
            groupRepo.delete(group);
        } else {
            group.getMembers().removeIf(m -> m.getUserId().equals(userId));
            groupRepo.save(group);
        }
    }

    // 그룹 랭킹 (기간별 공부 시간)
    public List<Map<String, Object>> getRanking(Long groupId, String userId, String period) {
        StudyGroup group = groupRepo.findById(groupId)
            .orElseThrow(() -> new RuntimeException("그룹을 찾을 수 없어요"));
        boolean isMember = group.getMembers().stream().anyMatch(m -> m.getUserId().equals(userId));
        if (!isMember) throw new IllegalArgumentException("멤버만 랭킹을 볼 수 있어요");

        LocalDate now = LocalDate.now();
        LocalDate from = switch (period) {
            case "week" -> now.minusDays(now.getDayOfWeek().getValue() % 7);
            case "month" -> now.withDayOfMonth(1);
            default -> now; // today
        };

        List<String> memberIds = group.getMembers().stream()
            .map(StudyGroupMember::getUserId)
            .collect(Collectors.toList());

        // 각 멤버의 기간 내 공부 시간 합산
        List<Map<String, Object>> ranking = new ArrayList<>();
        for (String memberId : memberIds) {
            List<StudySession> sessions = sessionRepo.findByUserIdOrderByStartTimeDesc(memberId);
            int totalMinutes = sessions.stream()
                .filter(s -> !s.getDate().isBefore(from))
                .mapToInt(StudySession::getDurationMinutes)
                .sum();
            User user = userRepo.findById(memberId).orElse(null);
            Map<String, Object> entry = new HashMap<>();
            entry.put("userId", memberId);
            entry.put("login", user != null ? user.getLogin() : memberId);
            entry.put("name", user != null ? user.getName() : memberId);
            entry.put("avatarUrl", user != null ? user.getAvatarUrl() : null);
            entry.put("totalMinutes", totalMinutes);
            entry.put("isMe", memberId.equals(userId));
            ranking.add(entry);
        }
        ranking.sort((a, b) -> (int) b.get("totalMinutes") - (int) a.get("totalMinutes"));
        // 순위 추가
        for (int i = 0; i < ranking.size(); i++) ranking.get(i).put("rank", i + 1);
        return ranking;
    }

    private Map<String, Object> toGroupMap(StudyGroup g, String userId) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", g.getId());
        m.put("name", g.getName());
        m.put("description", g.getDescription());
        m.put("ownerId", g.getOwnerId());
        m.put("isOwner", g.getOwnerId().equals(userId));
        m.put("memberCount", g.getMembers().size());
        m.put("members", g.getMembers().stream().map(mem -> {
            User u = userRepo.findById(mem.getUserId()).orElse(null);
            Map<String, Object> um = new HashMap<>();
            um.put("userId", mem.getUserId());
            um.put("login", u != null ? u.getLogin() : mem.getUserId());
            um.put("avatarUrl", u != null ? u.getAvatarUrl() : null);
            return um;
        }).collect(Collectors.toList()));
        m.put("createdAt", g.getCreatedAt());
        return m;
    }

    private void sendInviteNotification(StudyGroup group, String ownerId, String targetUserId) {
        try {
            User owner = userRepo.findById(ownerId).orElse(null);
            String ownerName = owner != null ? (owner.getName() != null ? owner.getName() : owner.getLogin()) : ownerId;
            sendPush(
                targetUserId,
                "스터디 그룹에 추가됨",
                ownerName + "님이 '" + group.getName() + "' 그룹에 추가했어요!",
                "/apps/study-planner/"
            );
        } catch (Exception e) {
            log.warn("Study group invite notification failed: {}", e.getMessage());
        }
    }

    private void sendPush(String userId, String title, String body, String url) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> payload = Map.of(
                "userId", userId,
                "title", title,
                "body", body,
                "url", url
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send", new HttpEntity<>(payload, headers), String.class);
        } catch (Exception e) {
            log.warn("Push notification failed for study group invite: {}", e.getMessage());
        }
    }
}
