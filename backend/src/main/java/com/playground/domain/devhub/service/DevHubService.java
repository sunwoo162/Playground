package com.playground.domain.devhub.service;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.devhub.dto.DevHubDto.CreateServerRequest;
import com.playground.domain.devhub.dto.DevHubDto.DirectMessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.MessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.SendMessageRequest;
import com.playground.domain.devhub.dto.DevHubDto.ServerResponse;
import com.playground.domain.devhub.dto.DevHubDto.UpdateGithubOrgRequest;
import com.playground.domain.devhub.entity.DevHubChatMessage;
import com.playground.domain.devhub.entity.DevHubDirectMessage;
import com.playground.domain.devhub.entity.DevHubServer;
import com.playground.domain.devhub.entity.DevHubServerMember;
import com.playground.domain.devhub.repository.DevHubChatMessageRepository;
import com.playground.domain.devhub.repository.DevHubDirectMessageRepository;
import com.playground.domain.devhub.repository.DevHubServerMemberRepository;
import com.playground.domain.devhub.repository.DevHubServerRepository;
import com.playground.domain.friend.entity.Friendship;
import com.playground.domain.friend.repository.FriendshipRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DevHubService {
    private final DevHubServerRepository serverRepository;
    private final DevHubServerMemberRepository memberRepository;
    private final DevHubChatMessageRepository messageRepository;
    private final DevHubDirectMessageRepository directMessageRepository;
    private final FriendshipRepository friendshipRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    @Transactional(readOnly = true)
    public List<ServerResponse> servers(JwtAuthenticationToken auth) {
        return memberRepository.findByUserIdOrderByJoinedAtDesc(auth.getUserId()).stream()
                .map(DevHubServerMember::getServer)
                .sorted(Comparator.comparing(DevHubServer::getCreatedAt).reversed())
                .map(this::toServerResponse)
                .toList();
    }

    public ServerResponse createServer(JwtAuthenticationToken auth, CreateServerRequest request) {
        String name = normalizeRequired(request.name(), "서버 이름을 입력해주세요.");
        String baseSlug = slugify(name);
        String slug = uniqueSlug(baseSlug);
        String githubOrg = normalizeOptional(request.githubOrg());
        String login = login(auth);

        DevHubServer server = DevHubServer.builder()
                .name(name)
                .slug(slug)
                .githubOrg(githubOrg.isBlank() ? slug : slugify(githubOrg))
                .description(normalizeOptional(request.description()))
                .ownerId(auth.getUserId())
                .ownerLogin(login)
                .build();
        DevHubServer saved = serverRepository.save(server);
        memberRepository.save(DevHubServerMember.builder()
                .server(saved)
                .userId(auth.getUserId())
                .userLogin(login)
                .role("OWNER")
                .build());
        return toServerResponse(saved);
    }

    public ServerResponse updateGithubOrg(JwtAuthenticationToken auth, Long serverId, UpdateGithubOrgRequest request) {
        DevHubServer server = requireMember(auth, serverId).getServer();
        String org = normalizeOptional(request.githubOrg());
        server.setGithubOrg(org.isBlank() ? server.getSlug() : slugify(org));
        return toServerResponse(server);
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(JwtAuthenticationToken auth, Long serverId, Long afterId) {
        requireMember(auth, serverId);
        List<DevHubChatMessage> messages = afterId != null && afterId > 0
                ? messageRepository.findByServer_IdAndIdGreaterThanOrderByIdAsc(serverId, afterId)
                : messageRepository.findTop80ByServer_IdOrderByCreatedAtDesc(serverId).stream()
                .sorted(Comparator.comparing(DevHubChatMessage::getCreatedAt))
                .toList();
        return messages.stream().map(this::toMessageResponse).toList();
    }

    public MessageResponse sendMessage(JwtAuthenticationToken auth, Long serverId, SendMessageRequest request) {
        DevHubServer server = requireMember(auth, serverId).getServer();
        String content = normalizeRequired(request.content(), "메시지를 입력해주세요.");
        if (content.length() > 2000) {
            throw new IllegalArgumentException("메시지는 2000자 이하로 입력해주세요.");
        }

        DevHubChatMessage saved = messageRepository.save(DevHubChatMessage.builder()
                .server(server)
                .authorId(auth.getUserId())
                .authorLogin(login(auth))
                .content(content)
                .build());
        sendServerMessagePush(server, auth.getUserId(), login(auth), content);
        return toMessageResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<DirectMessageResponse> directMessages(JwtAuthenticationToken auth, String friendId, Long afterId) {
        requireFriend(auth.getUserId(), friendId);
        String roomKey = dmRoomKey(auth.getUserId(), friendId);
        List<DevHubDirectMessage> messages = afterId != null && afterId > 0
                ? directMessageRepository.findByRoomKeyAndIdGreaterThanOrderByIdAsc(roomKey, afterId)
                : directMessageRepository.findTop80ByRoomKeyOrderByCreatedAtDesc(roomKey).stream()
                .sorted(Comparator.comparing(DevHubDirectMessage::getCreatedAt))
                .toList();
        return messages.stream().map(message -> toDirectMessageResponse(message, auth.getUserId())).toList();
    }

    public DirectMessageResponse sendDirectMessage(JwtAuthenticationToken auth, String friendId, SendMessageRequest request) {
        requireFriend(auth.getUserId(), friendId);
        String content = normalizeRequired(request.content(), "메시지를 입력해주세요.");
        if (content.length() > 2000) {
            throw new IllegalArgumentException("메시지는 2000자 이하로 입력해주세요.");
        }

        DevHubDirectMessage saved = directMessageRepository.save(DevHubDirectMessage.builder()
                .roomKey(dmRoomKey(auth.getUserId(), friendId))
                .senderId(auth.getUserId())
                .senderLogin(login(auth))
                .receiverId(friendId)
                .content(content)
                .build());
        sendPush(friendId, login(auth) + "님의 메시지", preview(content), "/apps/dev-action-hub/");
        return toDirectMessageResponse(saved, auth.getUserId());
    }

    private DevHubServerMember requireMember(JwtAuthenticationToken auth, Long serverId) {
        return memberRepository.findByServer_IdAndUserId(serverId, auth.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("서버에 접근할 수 없습니다."));
    }

    private void requireFriend(String userId, String friendId) {
        Friendship friendship = friendshipRepository.findBetween(userId, friendId)
                .orElseThrow(() -> new IllegalArgumentException("친구에게만 메시지를 보낼 수 있습니다."));
        if (friendship.getStatus() != Friendship.Status.ACCEPTED) {
            throw new IllegalArgumentException("친구 요청이 수락된 뒤 메시지를 보낼 수 있습니다.");
        }
    }

    private String dmRoomKey(String userId, String friendId) {
        return userId.compareTo(friendId) <= 0 ? userId + ":" + friendId : friendId + ":" + userId;
    }

    private void sendServerMessagePush(DevHubServer server, String senderId, String senderLogin, String content) {
        try {
            List<DevHubServerMember> recipients = memberRepository.findByServer_Id(server.getId()).stream()
                    .filter(member -> !member.getUserId().equals(senderId))
                    .toList();
            for (DevHubServerMember recipient : recipients) {
                sendPush(
                        recipient.getUserId(),
                        server.getName() + " - " + senderLogin,
                        preview(content),
                        "/apps/dev-action-hub/"
                );
            }
        } catch (Exception e) {
            log.warn("Dev hub server message push failed for server {}: {}", server.getId(), e.getMessage());
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
            log.warn("Dev hub message push failed for {}: {}", userId, e.getMessage());
        }
    }

    private String preview(String content) {
        String normalized = content.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 80) + "...";
    }

    private String uniqueSlug(String baseSlug) {
        String candidate = baseSlug;
        int suffix = 2;
        while (serverRepository.existsBySlug(candidate)) {
            candidate = baseSlug + "-" + suffix++;
        }
        return candidate;
    }

    private String slugify(String value) {
        String slug = value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9가-힣]+", "-")
                .replaceAll("^-+|-+$", "");
        return slug.isBlank() ? "dev-server" : slug;
    }

    private String normalizeRequired(String value, String message) {
        String out = normalizeOptional(value);
        if (out.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return out;
    }

    private String normalizeOptional(String value) {
        return value == null ? "" : value.trim();
    }

    private String login(JwtAuthenticationToken auth) {
        Object login = auth.getAttributes().get("login");
        String value = login == null ? "" : login.toString().trim();
        return value.isBlank() ? auth.getUserId() : value;
    }

    private ServerResponse toServerResponse(DevHubServer server) {
        return new ServerResponse(
                server.getId(),
                server.getName(),
                server.getSlug(),
                server.getGithubOrg(),
                server.getDescription(),
                server.getOwnerLogin(),
                server.getCreatedAt()
        );
    }

    private MessageResponse toMessageResponse(DevHubChatMessage message) {
        return new MessageResponse(
                message.getId(),
                message.getServer().getId(),
                message.getAuthorLogin(),
                message.getContent(),
                message.getCreatedAt()
        );
    }

    private DirectMessageResponse toDirectMessageResponse(DevHubDirectMessage message, String viewerId) {
        String friendId = message.getSenderId().equals(viewerId) ? message.getReceiverId() : message.getSenderId();
        return new DirectMessageResponse(
                message.getId(),
                friendId,
                message.getSenderLogin(),
                message.getContent(),
                message.getCreatedAt()
        );
    }
}
