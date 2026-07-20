package com.playground.domain.devhub.repository;

import com.playground.domain.devhub.entity.DevHubServerMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DevHubServerMemberRepository extends JpaRepository<DevHubServerMember, Long> {
    List<DevHubServerMember> findByUserIdOrderByJoinedAtDesc(String userId);

    List<DevHubServerMember> findByServer_Id(Long serverId);

    Optional<DevHubServerMember> findByServer_IdAndUserId(Long serverId, String userId);
}
