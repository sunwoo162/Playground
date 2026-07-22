package com.playground.domain.devhub.service;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.devhub.dto.DevHubDto.CreateServerRequest;
import com.playground.domain.devhub.dto.DevHubDto.DirectMessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.ForwardMessageRequest;
import com.playground.domain.devhub.dto.DevHubDto.MessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.ReactionRequest;
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
    private final UserRepository userRepository;
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

    public MessageResponse deleteMessage(JwtAuthenticationToken auth, Long serverId, Long messageId) {
        requireMember(auth, serverId);
        DevHubChatMessage message = requireServerMessage(serverId, messageId);
        if (!message.getAuthorId().equals(auth.getUserId())) {
            throw new IllegalArgumentException("내 메시지만 삭제할 수 있습니다.");
        }
        message.setDeleted(true);
        message.setContent("");
        return toMessageResponse(message);
    }

    public MessageResponse toggleMessagePin(JwtAuthenticationToken auth, Long serverId, Long messageId) {
        requireMember(auth, serverId);
        DevHubChatMessage message = requireServerMessage(serverId, messageId);
        message.setPinned(!message.isPinned());
        return toMessageResponse(message);
    }

    public MessageResponse reactToMessage(JwtAuthenticationToken auth, Long serverId, Long messageId, ReactionRequest request) {
        requireMember(auth, serverId);
        DevHubChatMessage message = requireServerMessage(serverId, messageId);
        message.setReactions(addReaction(message.getReactions(), request.emoji(), login(auth)));
        return toMessageResponse(message);
    }

    public Object forwardMessage(JwtAuthenticationToken auth, Long serverId, Long messageId, ForwardMessageRequest request) {
        requireMember(auth, serverId);
        DevHubChatMessage message = requireServerMessage(serverId, messageId);
        if (message.isDeleted()) {
            throw new IllegalArgumentException("삭제된 메시지는 전달할 수 없습니다.");
        }
        return forwardContent(auth, request, message.getContent());
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

    public DirectMessageResponse deleteDirectMessage(JwtAuthenticationToken auth, String friendId, Long messageId) {
        requireFriend(auth.getUserId(), friendId);
        DevHubDirectMessage message = requireDirectMessage(auth.getUserId(), friendId, messageId);
        if (!message.getSenderId().equals(auth.getUserId())) {
            throw new IllegalArgumentException("내 메시지만 삭제할 수 있습니다.");
        }
        message.setDeleted(true);
        message.setContent("");
        return toDirectMessageResponse(message, auth.getUserId());
    }

    public DirectMessageResponse toggleDirectMessagePin(JwtAuthenticationToken auth, String friendId, Long messageId) {
        requireFriend(auth.getUserId(), friendId);
        DevHubDirectMessage message = requireDirectMessage(auth.getUserId(), friendId, messageId);
        message.setPinned(!message.isPinned());
        return toDirectMessageResponse(message, auth.getUserId());
    }

    public DirectMessageResponse reactToDirectMessage(JwtAuthenticationToken auth, String friendId, Long messageId, ReactionRequest request) {
        requireFriend(auth.getUserId(), friendId);
        DevHubDirectMessage message = requireDirectMessage(auth.getUserId(), friendId, messageId);
        message.setReactions(addReaction(message.getReactions(), request.emoji(), login(auth)));
        return toDirectMessageResponse(message, auth.getUserId());
    }

    public Object forwardDirectMessage(JwtAuthenticationToken auth, String friendId, Long messageId, ForwardMessageRequest request) {
        requireFriend(auth.getUserId(), friendId);
        DevHubDirectMessage message = requireDirectMessage(auth.getUserId(), friendId, messageId);
        if (message.isDeleted()) {
            throw new IllegalArgumentException("삭제된 메시지는 전달할 수 없습니다.");
        }
        return forwardContent(auth, request, message.getContent());
    }

    private Object forwardContent(JwtAuthenticationToken auth, ForwardMessageRequest request, String content) {
        String targetType = normalizeOptional(request == null ? null : request.targetType());
        if (targetType.equals("server")) {
            DevHubServer targetServer = requireForwardTargetServer(auth, request);
            DevHubChatMessage saved = messageRepository.save(DevHubChatMessage.builder()
                    .server(targetServer)
                    .authorId(auth.getUserId())
                    .authorLogin(login(auth))
                    .content("전달: " + content)
                    .build());
            sendServerMessagePush(targetServer, auth.getUserId(), login(auth), saved.getContent());
            return toMessageResponse(saved);
        }

        String targetFriendId = requireForwardTargetFriend(auth, request);
        DevHubDirectMessage saved = directMessageRepository.save(DevHubDirectMessage.builder()
                .roomKey(dmRoomKey(auth.getUserId(), targetFriendId))
                .senderId(auth.getUserId())
                .senderLogin(login(auth))
                .receiverId(targetFriendId)
                .content("전달: " + content)
                .build());
        sendPush(targetFriendId, login(auth) + "님의 메시지", preview(saved.getContent()), "/apps/dev-action-hub/");
        return toDirectMessageResponse(saved, auth.getUserId());
    }

    private DevHubServerMember requireMember(JwtAuthenticationToken auth, Long serverId) {
        return memberRepository.findByServer_IdAndUserId(serverId, auth.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("서버에 접근할 수 없습니다."));
    }

    private DevHubChatMessage requireServerMessage(Long serverId, Long messageId) {
        return messageRepository.findById(messageId)
                .filter(message -> message.getServer().getId().equals(serverId))
                .orElseThrow(() -> new IllegalArgumentException("메시지를 찾을 수 없습니다."));
    }

    private DevHubDirectMessage requireDirectMessage(String userId, String friendId, Long messageId) {
        String roomKey = dmRoomKey(userId, friendId);
        return directMessageRepository.findById(messageId)
                .filter(message -> message.getRoomKey().equals(roomKey))
                .orElseThrow(() -> new IllegalArgumentException("메시지를 찾을 수 없습니다."));
    }

    private DevHubServer requireForwardTargetServer(JwtAuthenticationToken auth, ForwardMessageRequest request) {
        String targetType = normalizeOptional(request == null ? null : request.targetType());
        String targetId = normalizeOptional(request == null ? null : request.targetId());
        if (!targetType.equals("server")) {
            throw new IllegalArgumentException("전달할 서버를 선택해주세요.");
        }
        try {
            return requireMember(auth, Long.parseLong(targetId)).getServer();
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("전달할 서버를 선택해주세요.");
        }
    }

    private String requireForwardTargetFriend(JwtAuthenticationToken auth, ForwardMessageRequest request) {
        String targetType = normalizeOptional(request == null ? null : request.targetType());
        String targetId = normalizeOptional(request == null ? null : request.targetId());
        if (!targetType.equals("dm") || targetId.isBlank()) {
            throw new IllegalArgumentException("전달할 DM을 선택해주세요.");
        }
        requireFriend(auth.getUserId(), targetId);
        return targetId;
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

    private String addReaction(String reactions, String emoji, String userLogin) {
        String normalized = normalizeOptional(emoji);
        if (!List.of("👍", "❤️", "😂", "🎉", "🔥", "👏", "😮", "😢", "🙏", "✅", "🚀", "👀").contains(normalized)) {
            throw new IllegalArgumentException("지원하지 않는 이모티콘입니다.");
        }
        Map<String, java.util.LinkedHashSet<String>> usersByEmoji = new java.util.LinkedHashMap<>();
        if (reactions != null && !reactions.isBlank()) {
            for (String item : reactions.split(",")) {
                String[] parts = item.split("=", 2);
                if (parts.length == 2) {
                    java.util.LinkedHashSet<String> users = new java.util.LinkedHashSet<>();
                    if (parts[1].contains("|")) {
                        for (String user : parts[1].split("\\|")) {
                            String clean = normalizeOptional(user);
                            if (!clean.isBlank()) users.add(clean);
                        }
                    } else {
                        try {
                            int count = Integer.parseInt(parts[1]);
                            for (int index = 1; index <= count; index += 1) {
                                users.add("사용자 " + index);
                            }
                        } catch (NumberFormatException ignored) {
                        }
                    }
                    usersByEmoji.put(parts[0], users);
                }
            }
        }
        java.util.LinkedHashSet<String> currentUsers = usersByEmoji.computeIfAbsent(normalized, key -> new java.util.LinkedHashSet<>());
        if (currentUsers.contains(userLogin)) {
            currentUsers.remove(userLogin);
        } else {
            currentUsers.add(userLogin);
        }
        return usersByEmoji.entrySet().stream()
                .filter(entry -> !entry.getValue().isEmpty())
                .map(entry -> entry.getKey() + "=" + String.join("|", entry.getValue()))
                .collect(java.util.stream.Collectors.joining(","));
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
                avatarUrl(message.getAuthorId()),
                message.isDeleted() ? "삭제된 메시지입니다." : message.getContent(),
                message.isDeleted(),
                message.isPinned(),
                message.getReactions(),
                message.getCreatedAt()
        );
    }

    private DirectMessageResponse toDirectMessageResponse(DevHubDirectMessage message, String viewerId) {
        String friendId = message.getSenderId().equals(viewerId) ? message.getReceiverId() : message.getSenderId();
        return new DirectMessageResponse(
                message.getId(),
                friendId,
                message.getSenderLogin(),
                avatarUrl(message.getSenderId()),
                message.isDeleted() ? "삭제된 메시지입니다." : message.getContent(),
                message.isDeleted(),
                message.isPinned(),
                message.getReactions(),
                message.getCreatedAt()
        );
    }

    private String avatarUrl(String userId) {
        return userRepository.findById(userId)
                .map(user -> user.getAvatarUrl() == null ? "" : user.getAvatarUrl())
                .orElse("");
    }
}
