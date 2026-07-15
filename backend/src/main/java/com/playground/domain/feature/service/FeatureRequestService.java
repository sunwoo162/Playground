package com.playground.domain.feature.service;

import com.playground.domain.feature.dto.FeatureRequestDto;
import com.playground.domain.feature.entity.FeatureRequest;
import com.playground.domain.feature.repository.FeatureRequestRepository;
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
public class FeatureRequestService {
    private static final int MAX_MESSAGE_LENGTH = 1000;

    private final FeatureRequestRepository repository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.node-url:http://localhost:3000}")
    private String nodeUrl;

    @Value("${playground.admin-user:sunwoo162}")
    private String adminUser;

    @Transactional
    public FeatureRequestDto.Response create(String requesterId, FeatureRequestDto.CreateRequest req) {
        String message = normalizeMessage(req == null ? null : req.getMessage());
        FeatureRequest request = repository.save(FeatureRequest.builder()
                .requesterId(requesterId)
                .message(message)
                .build());

        sendAdminPush(request);
        return toResponse(request);
    }

    private String normalizeMessage(String message) {
        String value = message == null ? "" : message.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("요청 내용을 입력해주세요.");
        }
        if (value.length() > MAX_MESSAGE_LENGTH) {
            throw new IllegalArgumentException("요청 내용은 1000자 이하로 입력해주세요.");
        }
        return value;
    }

    private void sendAdminPush(FeatureRequest request) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> payload = Map.of(
                    "userId", adminUser,
                    "title", "놀이터 기능 추가 요청",
                    "body", request.getRequesterId() + "님: " + shortMessage(request.getMessage()),
                    "url", "/",
                    "sound", true
            );
            restTemplate.postForEntity(nodeUrl + "/internal/push/send", new HttpEntity<>(payload, headers), String.class);
        } catch (Exception e) {
            log.warn("Feature request push failed for admin {}: {}", adminUser, e.getMessage());
        }
    }

    private String shortMessage(String message) {
        return message.length() <= 80 ? message : message.substring(0, 80) + "...";
    }

    private FeatureRequestDto.Response toResponse(FeatureRequest request) {
        return FeatureRequestDto.Response.builder()
                .id(request.getId())
                .requesterId(request.getRequesterId())
                .message(request.getMessage())
                .createdAt(request.getCreatedAt())
                .build();
    }
}
