package com.playground.domain.friend.repository;

import com.playground.domain.friend.entity.Friendship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    // 두 유저 간의 관계 조회
    Optional<Friendship> findByRequesterIdAndReceiverId(String requesterId, String receiverId);

    // 받은 친구 요청 (PENDING)
    List<Friendship> findByReceiverIdAndStatus(String receiverId, Friendship.Status status);

    // 보낸 친구 요청 (PENDING)
    List<Friendship> findByRequesterIdAndStatus(String requesterId, Friendship.Status status);

    // 친구 목록 (ACCEPTED - 양방향)
    @Query("SELECT f FROM Friendship f WHERE (f.requesterId = :userId OR f.receiverId = :userId) AND f.status = 'ACCEPTED'")
    List<Friendship> findFriends(@Param("userId") String userId);

    // 두 유저 간 관계 존재 여부 (양방향)
    @Query("SELECT f FROM Friendship f WHERE ((f.requesterId = :a AND f.receiverId = :b) OR (f.requesterId = :b AND f.receiverId = :a))")
    Optional<Friendship> findBetween(@Param("a") String a, @Param("b") String b);
}
