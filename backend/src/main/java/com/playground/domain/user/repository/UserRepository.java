package com.playground.domain.user.repository;

import com.playground.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserRepository extends JpaRepository<User, String> {
    List<User> findByLoginContainingIgnoreCase(String login);
}
