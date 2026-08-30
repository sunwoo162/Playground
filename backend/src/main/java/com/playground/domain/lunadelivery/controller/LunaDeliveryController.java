package com.playground.domain.lunadelivery.controller;

import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.ProjectDetailResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.ProjectStateResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RegistrationRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RegistrationResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RuntimeResponse;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.RuntimeUpsertRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.TransitionRequest;
import com.playground.domain.lunadelivery.dto.LunaDeliveryDto.UpsertProjectRequest;
import com.playground.domain.lunadelivery.service.LunaDeliveryRegistrationService;
import com.playground.domain.lunadelivery.service.LunaDeliveryRegistryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/luna/delivery")
@RequiredArgsConstructor
public class LunaDeliveryController {
    private final LunaDeliveryRegistryService registry;
    private final LunaDeliveryRegistrationService registrationService;

    @PutMapping("/projects/{slug}")
    public ProjectStateResponse upsertProject(
            @PathVariable String slug,
            @RequestBody UpsertProjectRequest request
    ) {
        if (request.slug() != null && !request.slug().isBlank() && !slug.equalsIgnoreCase(request.slug().trim())) {
            throw new IllegalArgumentException("Path slug must match request slug.");
        }
        return registry.upsertProject(new UpsertProjectRequest(
                slug,
                request.repositoryFullName(),
                request.mainSha(),
                request.publicUrl()
        ));
    }

    @GetMapping("/projects/{slug}")
    public ProjectDetailResponse getProject(@PathVariable String slug) {
        return registry.getDetail(slug);
    }

    @PostMapping("/projects/{slug}/transition")
    public ProjectStateResponse transition(
            @PathVariable String slug,
            @RequestBody TransitionRequest request
    ) {
        return registry.transition(slug, request);
    }

    @PutMapping("/projects/{slug}/runtimes/{runtimeId}")
    public RuntimeResponse upsertRuntime(
            @PathVariable String slug,
            @PathVariable String runtimeId,
            @RequestBody RuntimeUpsertRequest request
    ) {
        return registry.upsertRuntime(slug, runtimeId, request);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse register(@RequestBody RegistrationRequest request) {
        return registrationService.register(request);
    }
}
