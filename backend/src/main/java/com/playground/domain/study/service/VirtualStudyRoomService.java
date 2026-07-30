package com.playground.domain.study.service;

import com.playground.domain.friend.entity.Friendship;
import com.playground.domain.friend.repository.FriendshipRepository;
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

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class VirtualStudyRoomService {

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    public void inviteFriend(String senderId, String targetUserId, String roomId) {
        if (targetUserId == null || targetUserId.isBlank()) {
            throw new IllegalArgumentException("초대할 친구를 선택해주세요");
        }
        if (roomId == null || roomId.isBlank()) {
            throw new IllegalArgumentException("방 ID가 필요합니다");
        }
        if (senderId.equals(targetUserId)) {
            throw new IllegalArgumentException("자기 자신은 초대할 수 없습니다");
        }

        Friendship friendship = friendshipRepository.findBetween(senderId, targetUserId)
            .orElseThrow(() -> new IllegalArgumentException("친구인 사용자만 초대할 수 있습니다"));
        if (friendship.getStatus() != Friendship.Status.ACCEPTED) {
            throw new IllegalArgumentException("친구인 사용자만 초대할 수 있습니다");
        }

        User sender = userRepository.findById(senderId).orElse(null);
        String senderName = sender != null
            ? (sender.getName() != null && !sender.getName().isBlank() ? sender.getName() : sender.getLogin())
            : senderId;

        sendPush(
            targetUserId,
            "가상 독서실 초대",
            senderName + "님이 같이 공부하자고 초대했어요. 수락하면 방에 참가합니다.",
            "/apps/virtual-study-room/?room=" + roomId + "&invitedBy=" + senderId
        );
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
            log.warn("Virtual study room invite notification failed: {}", e.getMessage());
        }
    }
}
