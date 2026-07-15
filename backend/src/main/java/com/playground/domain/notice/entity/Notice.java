package com.playground.domain.notice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "notices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notice {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, length = 4000)
    private String content;

    @Column(nullable = false, length = 120)
    private String authorId;

    @Column(nullable = false, length = 120)
    private String authorLogin;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
