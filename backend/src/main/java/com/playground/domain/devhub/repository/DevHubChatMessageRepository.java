package com.playground.domain.devhub.repository;

import com.playground.domain.devhub.entity.DevHubChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DevHubChatMessageRepository extends JpaRepository<DevHubChatMessage, Long> {
    List<DevHubChatMessage> findTop80ByServer_IdOrderByCreatedAtDesc(Long serverId);

    List<DevHubChatMessage> findByServer_IdAndIdGreaterThanOrderByIdAsc(Long serverId, Long afterId);
}
