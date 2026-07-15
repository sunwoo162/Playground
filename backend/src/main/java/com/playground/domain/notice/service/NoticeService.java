package com.playground.domain.notice.service;

import com.playground.domain.notice.dto.NoticeDto;
import com.playground.domain.notice.entity.Notice;
import com.playground.domain.notice.repository.NoticeRepository;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NoticeService {
    private static final int MAX_TITLE_LENGTH = 160;
    private static final int MAX_CONTENT_LENGTH = 4000;

    private final NoticeRepository repository;
    private final UserRepository userRepository;

    @Value("${playground.admin-user:sunwoo162}")
    private String adminUser;

    @Transactional(readOnly = true)
    public List<NoticeDto.Response> list() {
        return repository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean isAdmin(String userId) {
        return getUser(userId)
                .map(user -> adminUser.equalsIgnoreCase(user.getLogin()))
                .orElse(false);
    }

    @Transactional
    public NoticeDto.Response create(String authorId, NoticeDto.CreateRequest req) {
        User author = getUser(authorId)
                .orElseThrow(() -> new IllegalArgumentException("로그인이 필요합니다."));
        if (!adminUser.equalsIgnoreCase(author.getLogin())) {
            throw new IllegalArgumentException("공지 작성 권한이 없습니다.");
        }

        Notice notice = repository.save(Notice.builder()
                .title(normalizeTitle(req == null ? null : req.getTitle()))
                .content(normalizeContent(req == null ? null : req.getContent()))
                .authorId(author.getGithubId())
                .authorLogin(author.getLogin())
                .build());
        return toResponse(notice);
    }

    private java.util.Optional<User> getUser(String userId) {
        if (userId == null || userId.isBlank()) {
            return java.util.Optional.empty();
        }
        return userRepository.findById(userId);
    }

    private String normalizeTitle(String title) {
        String value = title == null ? "" : title.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("공지 제목을 입력해주세요.");
        }
        if (value.length() > MAX_TITLE_LENGTH) {
            throw new IllegalArgumentException("공지 제목은 160자 이하로 입력해주세요.");
        }
        return value;
    }

    private String normalizeContent(String content) {
        String value = content == null ? "" : content.trim();
        if (value.isBlank()) {
            throw new IllegalArgumentException("공지 내용을 입력해주세요.");
        }
        if (value.length() > MAX_CONTENT_LENGTH) {
            throw new IllegalArgumentException("공지 내용은 4000자 이하로 입력해주세요.");
        }
        return value;
    }

    private NoticeDto.Response toResponse(Notice notice) {
        return NoticeDto.Response.builder()
                .id(notice.getId())
                .title(notice.getTitle())
                .content(notice.getContent())
                .authorLogin(notice.getAuthorLogin())
                .createdAt(notice.getCreatedAt())
                .build();
    }
}
