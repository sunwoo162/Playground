package com.playground.domain.study.service;

import com.playground.domain.study.entity.StudyGroup;
import com.playground.domain.study.entity.StudyGroupMember;
import com.playground.domain.study.entity.StudySession;
import com.playground.domain.study.repository.StudyGroupRepository;
import com.playground.domain.study.repository.StudyGroupMemberRepository;
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
    private final StudyGroupMemberRepository memberRepo;
    private final StudySessionRepository sessionRepo;
    private final UserRepository userRepo;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    // 내 그룹 목록
    public List<Map<String, Object>> getMyGroups(String userId) {
        return groupRepo.findByMemberOrOwner(userId, StudyGroupMember.Status.ACCEPTED).stream()
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
            .status(StudyGroupMember.Status.ACCEPTED)
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

        group.getMembers().add(StudyGroupMember.builder()
            .group(group)
            .userId(targetUserId)
            .status(StudyGroupMember.Status.PENDING)
            .build());
        groupRepo.save(group);
        sendInviteNotification(group, ownerId, targetUserId);
    }

    public List<Map<String, Object>> getInvitations(String userId) {
        return memberRepo.findByUserIdAndStatus(userId, StudyGroupMember.Status.PENDING).stream()
            .map(member -> {
                StudyGroup group = member.getGroup();
                User owner = userRepo.findById(group.getOwnerId()).orElse(null);
                Map<String, Object> m = new HashMap<>();
                m.put("memberId", member.getId());
                m.put("groupId", group.getId());
                m.put("groupName", group.getName());
                m.put("groupDescription", group.getDescription());
                m.put("ownerId", group.getOwnerId());
                m.put("ownerLogin", owner != null ? owner.getLogin() : group.getOwnerId());
                m.put("ownerName", owner != null ? owner.getName() : group.getOwnerId());
                m.put("ownerAvatarUrl", owner != null ? owner.getAvatarUrl() : null);
                m.put("createdAt", member.getJoinedAt());
                return m;
            })
            .collect(Collectors.toList());
    }

    @Transactional
    public void acceptInvitation(Long memberId, String userId) {
        StudyGroupMember member = memberRepo.findById(memberId)
            .orElseThrow(() -> new RuntimeException("초대를 찾을 수 없어요"));
        if (!member.getUserId().equals(userId)) throw new IllegalArgumentException("권한 없음");
        member.setStatus(StudyGroupMember.Status.ACCEPTED);
    }

    @Transactional
    public void rejectInvitation(Long memberId, String userId) {
        StudyGroupMember member = memberRepo.findById(memberId)
            .orElseThrow(() -> new RuntimeException("초대를 찾을 수 없어요"));
        if (!member.getUserId().equals(userId)) throw new IllegalArgumentException("권한 없음");
        memberRepo.delete(member);
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
        boolean isMember = group.getOwnerId().equals(userId) || group.getMembers().stream()
            .anyMatch(m -> m.getUserId().equals(userId) && isAccepted(m));
        if (!isMember) throw new IllegalArgumentException("멤버만 랭킹을 볼 수 있어요");

        LocalDate now = LocalDate.now();
        LocalDate from = switch (period) {
            case "week" -> now.minusDays(now.getDayOfWeek().getValue() % 7);
            case "month" -> now.withDayOfMonth(1);
            default -> now; // today
        };

        List<String> memberIds = group.getMembers().stream()
            .filter(this::isAccepted)
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
        List<StudyGroupMember> acceptedMembers = g.getMembers().stream()
            .filter(this::isAccepted)
            .collect(Collectors.toList());
        m.put("memberCount", acceptedMembers.size());
        m.put("members", acceptedMembers.stream().map(mem -> {
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

    private boolean isAccepted(StudyGroupMember member) {
        return member.getStatus() == null || member.getStatus() == StudyGroupMember.Status.ACCEPTED;
    }

    private void sendInviteNotification(StudyGroup group, String ownerId, String targetUserId) {
        try {
            User owner = userRepo.findById(ownerId).orElse(null);
            String ownerName = owner != null ? (owner.getName() != null ? owner.getName() : owner.getLogin()) : ownerId;
            sendPush(
                targetUserId,
                "스터디 그룹 초대",
                ownerName + "님이 '" + group.getName() + "' 그룹에 초대했어요!",
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
