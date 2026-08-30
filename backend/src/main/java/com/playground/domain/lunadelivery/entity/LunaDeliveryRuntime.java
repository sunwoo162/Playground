package com.playground.domain.lunadelivery.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "luna_delivery_runtimes",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_luna_delivery_runtime_project_runtime",
                        columnNames = {"project_id", "runtime_id"}
                )
        },
        indexes = {
                @Index(name = "idx_luna_delivery_runtime_project", columnList = "project_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LunaDeliveryRuntime {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private LunaDeliveryProject project;

    @Column(name = "runtime_id", nullable = false, length = 80)
    private String runtimeId;

    @Column(name = "runtime_type", nullable = false, length = 20)
    private String runtimeType;

    @Column(name = "slot_a_port")
    private Integer slotAPort;

    @Column(name = "slot_b_port")
    private Integer slotBPort;

    @Column(name = "active_slot", length = 1)
    private String activeSlot;

    @Column(name = "candidate_slot", length = 1)
    private String candidateSlot;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
