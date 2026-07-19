package com.playground.domain.devhub.service;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.devhub.dto.DevHubDto.CreateServerRequest;
import com.playground.domain.devhub.dto.DevHubDto.MessageResponse;
import com.playground.domain.devhub.dto.DevHubDto.SendMessageRequest;
import com.playground.domain.devhub.dto.DevHubDto.ServerResponse;
import com.playground.domain.devhub.dto.DevHubDto.UpdateGithubOrgRequest;
import com.playground.domain.devhub.entity.DevHubChatMessage;
import com.playground.domain.devhub.entity.DevHubServer;
import com.playground.domain.devhub.entity.DevHubServerMember;
import com.playground.domain.devhub.repository.DevHubChatMessageRepository;
import com.playground.domain.devhub.repository.DevHubServerMemberRepository;
import com.playground.domain.devhub.repository.DevHubServerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional
public class DevHubService {
    private final DevHubServerRepository serverRepository;
    private final DevHubServerMemberRepository memberRepository;
    private final DevHubChatMessageRepository messageRepository;

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
        String login = login(auth);

        DevHubServer server = DevHubServer.builder()
                .name(name)
                .slug(slug)
                .githubOrg(slug)
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
        return toMessageResponse(saved);
    }

    private DevHubServerMember requireMember(JwtAuthenticationToken auth, Long serverId) {
        return memberRepository.findByServer_IdAndUserId(serverId, auth.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("서버에 접근할 수 없습니다."));
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
}
