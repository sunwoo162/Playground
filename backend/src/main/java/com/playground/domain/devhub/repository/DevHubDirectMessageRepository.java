package com.playground.domain.devhub.repository;

import com.playground.domain.devhub.entity.DevHubDirectMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DevHubDirectMessageRepository extends JpaRepository<DevHubDirectMessage, Long> {
    List<DevHubDirectMessage> findTop80ByRoomKeyOrderByCreatedAtDesc(String roomKey);

    List<DevHubDirectMessage> findByRoomKeyAndIdGreaterThanOrderByIdAsc(String roomKey, Long afterId);
}
