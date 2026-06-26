package com.playground.domain.friend.service;

import com.playground.domain.friend.dto.FriendDto;
import com.playground.domain.friend.entity.Friendship;
import com.playground.domain.friend.repository.FriendshipRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FriendService {

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    // 유저 검색 (놀이터 가입자 한정, 자기 자신 제외)
    public List<FriendDto.UserResponse> searchUsers(String query, String myId) {
        return userRepository.findByLoginContainingIgnoreCase(query).stream()
            .filter(u -> !u.getGithubId().equals(myId))
            .map(u -> toUserResponse(u, myId))
            .collect(Collectors.toList());
    }

    // 최근 가입자 목록 (자기 자신 제외, 최근 20명)
    public List<FriendDto.UserResponse> getRecentUsers(String myId) {
        return userRepository.findAll().stream()
            .filter(u -> !u.getGithubId().equals(myId))
            .sorted((a, b) -> {
                if (a.getLastLoginAt() == null) return 1;
                if (b.getLastLoginAt() == null) return -1;
                return b.getLastLoginAt().compareTo(a.getLastLoginAt());
            })
            .limit(20)
            .map(u -> toUserResponse(u, myId))
            .collect(Collectors.toList());
    }

    private FriendDto.UserResponse toUserResponse(User u, String myId) {
        Optional<Friendship> rel = friendshipRepository.findBetween(myId, u.getGithubId());
        String status = null;
        if (rel.isPresent()) {
            Friendship f = rel.get();
            if (f.getStatus() == Friendship.Status.ACCEPTED) {
                status = "ACCEPTED";
            } else if (f.getStatus() == Friendship.Status.PENDING) {
                status = f.getRequesterId().equals(myId) ? "PENDING_SENT" : "PENDING_RECEIVED";
            }
        }
        return FriendDto.UserResponse.builder()
            .githubId(u.getGithubId())
            .login(u.getLogin())
            .name(u.getName())
            .avatarUrl(u.getAvatarUrl())
            .friendStatus(status)
            .build();
    }

    // 친구 요청 보내기
    @Transactional
    public void sendRequest(String requesterId, String receiverId) {
        if (requesterId.equals(receiverId)) throw new IllegalArgumentException("자기 자신에게 요청 불가");

        userRepository.findById(receiverId)
            .orElseThrow(() -> new RuntimeException("존재하지 않는 유저"));

        friendshipRepository.findBetween(requesterId, receiverId).ifPresent(f -> {
            throw new IllegalStateException("이미 관계가 존재합니다");
        });

        friendshipRepository.save(Friendship.builder()
            .requesterId(requesterId)
            .receiverId(receiverId)
            .status(Friendship.Status.PENDING)
            .build());

        // Web Push 알림 발송 (비동기, 실패해도 요청은 성공)
        try {
            User requester = userRepository.findById(requesterId).orElse(null);
            String requesterName = requester != null ? (requester.getName() != null ? requester.getName() : requester.getLogin()) : requesterId;

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> pushBody = Map.of(
                "userId", receiverId,
                "title", "새 친구 요청",
                "body", requesterName + "님이 친구 요청을 보냈어요!",
                "url", "/mypage"
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send", new HttpEntity<>(pushBody, headers), String.class);
        } catch (Exception e) {
            log.warn("Push notification failed for friend request: {}", e.getMessage());
        }
    }

    // 받은 친구 요청 목록
    public List<FriendDto.RequestResponse> getReceivedRequests(String userId) {
        return friendshipRepository.findByReceiverIdAndStatus(userId, Friendship.Status.PENDING).stream()
            .map(f -> {
                User requester = userRepository.findById(f.getRequesterId()).orElse(null);
                if (requester == null) return null;
                return FriendDto.RequestResponse.builder()
                    .requestId(f.getId())
                    .githubId(requester.getGithubId())
                    .login(requester.getLogin())
                    .name(requester.getName())
                    .avatarUrl(requester.getAvatarUrl())
                    .createdAt(f.getCreatedAt().toString())
                    .build();
            })
            .filter(r -> r != null)
            .collect(Collectors.toList());
    }

    // 친구 요청 수락
    @Transactional
    public void acceptRequest(Long requestId, String userId) {
        Friendship f = friendshipRepository.findById(requestId)
            .orElseThrow(() -> new RuntimeException("요청을 찾을 수 없음"));
        if (!f.getReceiverId().equals(userId)) throw new IllegalArgumentException("권한 없음");
        f.setStatus(Friendship.Status.ACCEPTED);
    }

    // 친구 요청 거절
    @Transactional
    public void rejectRequest(Long requestId, String userId) {
        Friendship f = friendshipRepository.findById(requestId)
            .orElseThrow(() -> new RuntimeException("요청을 찾을 수 없음"));
        if (!f.getReceiverId().equals(userId)) throw new IllegalArgumentException("권한 없음");
        friendshipRepository.delete(f);
    }

    // 친구 목록
    public List<FriendDto.UserResponse> getFriends(String userId) {
        return friendshipRepository.findFriends(userId).stream()
            .map(f -> {
                String friendId = f.getRequesterId().equals(userId) ? f.getReceiverId() : f.getRequesterId();
                return userRepository.findById(friendId).map(u -> toUserResponse(u, userId)).orElse(null);
            })
            .filter(u -> u != null)
            .collect(Collectors.toList());
    }

    // 친구 삭제
    @Transactional
    public void removeFriend(String userId, String friendId) {
        Friendship f = friendshipRepository.findBetween(userId, friendId)
            .orElseThrow(() -> new RuntimeException("친구 관계가 없음"));
        friendshipRepository.delete(f);
    }
}
