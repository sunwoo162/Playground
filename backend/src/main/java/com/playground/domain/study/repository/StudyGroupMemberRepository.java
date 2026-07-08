package com.playground.domain.study.repository;

import com.playground.domain.study.entity.StudyGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudyGroupMemberRepository extends JpaRepository<StudyGroupMember, Long> {
    List<StudyGroupMember> findByUserIdAndStatus(String userId, StudyGroupMember.Status status);
    Optional<StudyGroupMember> findByGroupIdAndUserId(Long groupId, String userId);
}
