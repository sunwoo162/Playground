package com.playground.domain.devnotes.repository;

import com.playground.domain.devnotes.entity.ProjectShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProjectShareRepository extends JpaRepository<ProjectShare, Long> {
    List<ProjectShare> findByProjectId(Long projectId);
    List<ProjectShare> findByUserId(String userId);
    Optional<ProjectShare> findByProjectIdAndUserId(Long projectId, String userId);
    void deleteByProjectIdAndUserId(Long projectId, String userId);

    // 프로젝트에 접근 가능한지 (소유자 or 공유받은 사람)
    @Query("SELECT COUNT(ps) > 0 FROM ProjectShare ps WHERE ps.project.id = :projectId AND ps.userId = :userId")
    boolean existsByProjectIdAndUserId(@Param("projectId") Long projectId, @Param("userId") String userId);
}
