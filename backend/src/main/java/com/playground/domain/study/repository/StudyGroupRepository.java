package com.playground.domain.study.repository;

import com.playground.domain.study.entity.StudyGroup;
import com.playground.domain.study.entity.StudyGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StudyGroupRepository extends JpaRepository<StudyGroup, Long> {

    @Query("SELECT DISTINCT g FROM StudyGroup g LEFT JOIN g.members m WHERE g.ownerId = :userId OR (m.userId = :userId AND (m.status = :status OR m.status IS NULL))")
    List<StudyGroup> findByMemberOrOwner(@Param("userId") String userId, @Param("status") StudyGroupMember.Status status);
}
