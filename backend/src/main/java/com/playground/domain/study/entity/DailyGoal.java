package com.playground.domain.study.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "daily_goals")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DailyGoal {

    @Id
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(nullable = false)
    private int totalMinutes;
}
