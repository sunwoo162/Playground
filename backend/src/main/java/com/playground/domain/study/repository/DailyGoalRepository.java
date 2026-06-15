package com.playground.domain.study.repository;

import com.playground.domain.study.entity.DailyGoal;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyGoalRepository extends JpaRepository<DailyGoal, String> {
}
