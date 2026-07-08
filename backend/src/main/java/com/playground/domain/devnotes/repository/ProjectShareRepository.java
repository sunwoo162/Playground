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
    List<ProjectShare> findByUserIdAndStatus(String userId, ProjectShare.Status status);
    Optional<ProjectShare> findByProjectIdAndUserId(Long projectId, String userId);
    void deleteByProjectIdAndUserId(Long projectId, String userId);

    @Query("SELECT ps FROM ProjectShare ps WHERE ps.project.id = :projectId AND (ps.status = :status OR ps.status IS NULL)")
    List<ProjectShare> findAcceptedByProjectId(@Param("projectId") Long projectId, @Param("status") ProjectShare.Status status);

    @Query("SELECT ps FROM ProjectShare ps WHERE ps.userId = :userId AND (ps.status = :status OR ps.status IS NULL)")
    List<ProjectShare> findAcceptedByUserId(@Param("userId") String userId, @Param("status") ProjectShare.Status status);

    // 프로젝트에 접근 가능한지 (소유자 or 수락한 공유 사용자)
    @Query("SELECT COUNT(ps) > 0 FROM ProjectShare ps WHERE ps.project.id = :projectId AND ps.userId = :userId AND (ps.status = :status OR ps.status IS NULL)")
    boolean existsAcceptedByProjectIdAndUserId(@Param("projectId") Long projectId, @Param("userId") String userId, @Param("status") ProjectShare.Status status);
}
