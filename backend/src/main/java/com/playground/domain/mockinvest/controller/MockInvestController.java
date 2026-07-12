package com.playground.domain.mockinvest.controller;

import com.playground.config.JwtAuthenticationToken;
import com.playground.domain.mockinvest.dto.MockInvestDto;
import com.playground.domain.mockinvest.service.MockInvestService;
import com.playground.domain.mockinvest.service.StockProviderException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mock-invest")
@RequiredArgsConstructor
public class MockInvestController {
    private final MockInvestService service;

    @GetMapping("/me")
    public ResponseEntity<MockInvestDto.PortfolioResponse> me(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.me(auth.getUserId()));
    }

    @PostMapping("/assets/initial")
    public ResponseEntity<MockInvestDto.PortfolioResponse> initial(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.me(auth.getUserId()));
    }

    @PostMapping("/assets/reward")
    public ResponseEntity<MockInvestDto.PortfolioResponse> reward(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody(required = false) MockInvestDto.RewardRequest req) {
        return ResponseEntity.ok(service.reward(auth.getUserId(), req != null ? req : new MockInvestDto.RewardRequest()));
    }

    @GetMapping("/stocks")
    public ResponseEntity<List<MockInvestDto.StockResponse>> stocks(@RequestParam(required = false) String keyword) {
        return ResponseEntity.ok(service.stocks(keyword));
    }

    @GetMapping("/stocks/{symbol}")
    public ResponseEntity<MockInvestDto.StockResponse> stock(@PathVariable String symbol) {
        return ResponseEntity.ok(service.stock(symbol));
    }

    @PostMapping("/trades/buy")
    public ResponseEntity<MockInvestDto.OrderResponse> buy(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody MockInvestDto.TradeRequest req) {
        return ResponseEntity.ok(service.buy(auth.getUserId(), req));
    }

    @PostMapping("/trades/sell")
    public ResponseEntity<MockInvestDto.OrderResponse> sell(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody MockInvestDto.TradeRequest req) {
        return ResponseEntity.ok(service.sell(auth.getUserId(), req));
    }

    @GetMapping("/portfolio")
    public ResponseEntity<MockInvestDto.PortfolioResponse> portfolio(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.portfolio(auth.getUserId()));
    }

    @GetMapping("/orders")
    public ResponseEntity<List<MockInvestDto.OrderResponse>> orders(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.orders(auth.getUserId()));
    }

    @GetMapping("/watchlist")
    public ResponseEntity<List<MockInvestDto.StockResponse>> watchlist(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.watchlist(auth.getUserId()));
    }

    @PostMapping("/watchlist")
    public ResponseEntity<Map<String, Boolean>> addWatch(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody MockInvestDto.WatchRequest req) {
        service.addWatch(auth.getUserId(), req);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @DeleteMapping("/watchlist/{symbol}")
    public ResponseEntity<Map<String, Boolean>> removeWatch(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable String symbol) {
        service.removeWatch(auth.getUserId(), symbol);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/rankings")
    public ResponseEntity<List<MockInvestDto.RankingResponse>> rankings() {
        return ResponseEntity.ok(service.rankings());
    }

    @GetMapping("/journals")
    public ResponseEntity<List<MockInvestDto.JournalResponse>> journals(@AuthenticationPrincipal JwtAuthenticationToken auth) {
        return ResponseEntity.ok(service.journals(auth.getUserId()));
    }

    @PostMapping("/journals")
    public ResponseEntity<MockInvestDto.JournalResponse> createJournal(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @RequestBody MockInvestDto.JournalRequest req) {
        return ResponseEntity.ok(service.createJournal(auth.getUserId(), req));
    }

    @PatchMapping("/journals/{id}")
    public ResponseEntity<MockInvestDto.JournalResponse> updateJournal(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long id,
            @RequestBody MockInvestDto.JournalRequest req) {
        return ResponseEntity.ok(service.updateJournal(auth.getUserId(), id, req));
    }

    @DeleteMapping("/journals/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteJournal(
            @AuthenticationPrincipal JwtAuthenticationToken auth,
            @PathVariable Long id) {
        service.deleteJournal(auth.getUserId(), id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @ExceptionHandler(StockProviderException.class)
    public ResponseEntity<Map<String, String>> stockProviderError(StockProviderException e) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", e.getMessage()));
    }
}
