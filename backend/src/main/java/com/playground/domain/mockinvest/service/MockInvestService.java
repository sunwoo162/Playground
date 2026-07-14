package com.playground.domain.mockinvest.service;

import com.playground.domain.mockinvest.dto.MockInvestDto;
import com.playground.domain.mockinvest.entity.*;
import com.playground.domain.mockinvest.repository.*;
import com.playground.domain.user.entity.User;
import com.playground.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MockInvestService {
    private static final BigDecimal INITIAL_CASH = BigDecimal.valueOf(100_000);
    private static final String ADMIN_LOGIN = "sunwoo162";

    private final MockInvestAccountRepository accountRepository;
    private final MockInvestHoldingRepository holdingRepository;
    private final MockInvestOrderRepository orderRepository;
    private final MockInvestWatchlistRepository watchlistRepository;
    private final MockInvestJournalRepository journalRepository;
    private final MockInvestStockRequestRepository stockRequestRepository;
    private final UserRepository userRepository;
    private final TwelveDataStockClient stockClient;

    @Transactional
    public MockInvestDto.PortfolioResponse me(String userId) {
        ensureAccount(userId);
        return portfolio(userId);
    }

    public List<MockInvestDto.StockResponse> stocks(String keyword) {
        return stockClient.search(keyword);
    }

    public MockInvestDto.StockResponse stock(String symbol) {
        return stockClient.quote(symbol);
    }

    public List<MockInvestDto.ChartCandleResponse> stockChart(String symbol, String range) {
        return stockClient.chart(symbol, range);
    }

    @Transactional
    public MockInvestDto.OrderResponse buy(String userId, MockInvestDto.TradeRequest req) {
        if (req.getQuantity() == null || req.getQuantity() < 1) throw new IllegalArgumentException("quantity must be greater than zero");
        MockInvestAccount account = ensureAccount(userId);
        MockInvestDto.StockResponse stock = stockClient.quote(req.getSymbol());
        BigDecimal cost = stock.getPrice().multiply(BigDecimal.valueOf(req.getQuantity()));
        if (account.getCash().compareTo(cost) < 0) throw new IllegalArgumentException("cash is not enough");

        MockInvestHolding holding = holdingRepository.findByUserIdAndSymbol(userId, stock.getSymbol())
                .orElse(MockInvestHolding.builder()
                        .userId(userId)
                        .symbol(stock.getSymbol())
                        .name(stock.getName())
                        .quantity(0L)
                        .averagePrice(BigDecimal.ZERO)
                        .build());
        BigDecimal previousCost = holding.getAveragePrice().multiply(BigDecimal.valueOf(holding.getQuantity()));
        long nextQuantity = holding.getQuantity() + req.getQuantity();
        holding.setQuantity(nextQuantity);
        holding.setAveragePrice(previousCost.add(cost).divide(BigDecimal.valueOf(nextQuantity), 2, RoundingMode.HALF_UP));
        holding.setName(stock.getName());
        holdingRepository.save(holding);

        account.setCash(account.getCash().subtract(cost));
        MockInvestOrder order = saveOrder(userId, MockInvestOrder.OrderType.BUY, stock, req.getQuantity());
        return toOrder(order);
    }

    @Transactional
    public MockInvestDto.OrderResponse sell(String userId, MockInvestDto.TradeRequest req) {
        if (req.getQuantity() == null || req.getQuantity() < 1) throw new IllegalArgumentException("quantity must be greater than zero");
        MockInvestAccount account = ensureAccount(userId);
        MockInvestDto.StockResponse stock = stockClient.quote(req.getSymbol());
        MockInvestHolding holding = holdingRepository.findByUserIdAndSymbol(userId, stock.getSymbol())
                .orElseThrow(() -> new IllegalArgumentException("holding not found"));
        if (holding.getQuantity() < req.getQuantity()) throw new IllegalArgumentException("holding quantity is not enough");

        holding.setQuantity(holding.getQuantity() - req.getQuantity());
        if (holding.getQuantity() == 0) holdingRepository.delete(holding);
        account.setCash(account.getCash().add(stock.getPrice().multiply(BigDecimal.valueOf(req.getQuantity()))));
        MockInvestOrder order = saveOrder(userId, MockInvestOrder.OrderType.SELL, stock, req.getQuantity());
        return toOrder(order);
    }

    @Transactional
    public MockInvestDto.PortfolioResponse portfolio(String userId) {
        MockInvestAccount account = ensureAccount(userId);
        List<MockInvestDto.HoldingResponse> holdings = holdingRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream().map(this::toHolding).toList();
        BigDecimal invested = holdings.stream().map(MockInvestDto.HoldingResponse::getInvested).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal evaluated = holdings.stream().map(MockInvestDto.HoldingResponse::getEvaluated).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalAsset = account.getCash().add(evaluated);
        BigDecimal profit = totalAsset.subtract(account.getRewardedAmount());
        return MockInvestDto.PortfolioResponse.builder()
                .cash(account.getCash())
                .rewardedAmount(account.getRewardedAmount())
                .invested(invested)
                .evaluated(evaluated)
                .totalAsset(totalAsset)
                .profit(profit)
                .profitRate(rate(profit, account.getRewardedAmount()))
                .holdings(holdings)
                .build();
    }

    public List<MockInvestDto.OrderResponse> orders(String userId) {
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(this::toOrder).toList();
    }

    public List<MockInvestDto.StockResponse> watchlist(String userId) {
        return watchlistRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::quoteWatchOrFallback).toList();
    }

    @Transactional
    public void addWatch(String userId, MockInvestDto.WatchRequest req) {
        MockInvestDto.StockResponse stock = stockClient.quote(req.getSymbol());
        watchlistRepository.findByUserIdAndSymbol(userId, stock.getSymbol()).orElseGet(() ->
                watchlistRepository.save(MockInvestWatchlist.builder()
                        .userId(userId)
                        .symbol(stock.getSymbol())
                        .name(stock.getName())
                        .build()));
    }

    @Transactional
    public void removeWatch(String userId, String symbol) {
        watchlistRepository.deleteByUserIdAndSymbol(userId, symbol);
    }

    public List<MockInvestDto.JournalResponse> journals(String userId) {
        return journalRepository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(this::toJournal).toList();
    }

    @Transactional
    public MockInvestDto.JournalResponse createJournal(String userId, MockInvestDto.JournalRequest req) {
        MockInvestDto.StockResponse stock = stockClient.quote(req.getSymbol());
        MockInvestJournal journal = journalRepository.save(MockInvestJournal.builder()
                .userId(userId)
                .symbol(stock.getSymbol())
                .name(stock.getName())
                .title(req.getTitle())
                .content(req.getContent())
                .result(req.getResult())
                .build());
        return toJournal(journal);
    }

    @Transactional
    public MockInvestDto.JournalResponse updateJournal(String userId, Long id, MockInvestDto.JournalRequest req) {
        MockInvestJournal journal = journalRepository.findByIdAndUserId(id, userId).orElseThrow();
        journal.setTitle(req.getTitle());
        journal.setContent(req.getContent());
        journal.setResult(req.getResult());
        return toJournal(journal);
    }

    @Transactional
    public void deleteJournal(String userId, Long id) {
        MockInvestJournal journal = journalRepository.findByIdAndUserId(id, userId).orElseThrow();
        journalRepository.delete(journal);
    }

    @Transactional
    public List<MockInvestDto.RankingResponse> rankings() {
        List<MockInvestDto.RankingResponse> rows = accountRepository.findAll().stream()
                .map(a -> {
                    MockInvestDto.PortfolioResponse p = portfolio(a.getUserId());
                    User user = userRepository.findById(a.getUserId()).orElse(null);
                    return MockInvestDto.RankingResponse.builder()
                            .userId(a.getUserId())
                            .nickname(user != null ? (user.getName() != null ? user.getName() : user.getLogin()) : a.getUserId())
                            .avatarUrl(user != null ? user.getAvatarUrl() : null)
                            .totalAsset(p.getTotalAsset())
                            .profitRate(p.getProfitRate())
                            .build();
                })
                .sorted(Comparator.comparing(MockInvestDto.RankingResponse::getProfitRate).reversed())
                .limit(50)
                .toList();
        for (int i = 0; i < rows.size(); i++) {
            rows.get(i).setRank(i + 1);
        }
        return rows;
    }

    @Transactional
    public MockInvestDto.StockRequestResponse requestStock(String userId, MockInvestDto.StockRequestSubmitRequest req) {
        if (req == null || req.getCompany() == null || req.getCompany().isBlank()) {
            throw new IllegalArgumentException("company is required");
        }
        MockInvestStockRequest stockRequest = stockRequestRepository.save(MockInvestStockRequest.builder()
                .userId(userId)
                .company(req.getCompany().trim())
                .symbol(normalizeNullable(req.getSymbol()))
                .memo(normalizeNullable(req.getMemo()))
                .status(MockInvestStockRequest.RequestStatus.PENDING)
                .build());
        return toStockRequest(stockRequest);
    }

    public List<MockInvestDto.StockRequestResponse> myStockRequests(String userId) {
        return stockRequestRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toStockRequest)
                .toList();
    }

    public MockInvestDto.AdminStatusResponse adminStatus(String userId) {
        return MockInvestDto.AdminStatusResponse.builder().admin(isAdmin(userId)).build();
    }

    public List<MockInvestDto.StockRequestResponse> adminStockRequests(String adminUserId) {
        requireAdmin(adminUserId);
        return stockRequestRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toStockRequest)
                .toList();
    }

    @Transactional
    public List<MockInvestDto.AdminAccountResponse> adminAccounts(String adminUserId) {
        requireAdmin(adminUserId);
        return accountRepository.findAll().stream()
                .map(this::toAdminAccount)
                .sorted(Comparator.comparing(MockInvestDto.AdminAccountResponse::getTotalAsset).reversed())
                .toList();
    }

    @Transactional
    public MockInvestDto.AdminAccountResponse adminAddCash(String adminUserId, MockInvestDto.AdminCashRequest req) {
        requireAdmin(adminUserId);
        if (req == null || req.getUserId() == null || req.getUserId().isBlank()) {
            throw new IllegalArgumentException("userId is required");
        }
        if (req.getAmount() == null || req.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("amount must be greater than zero");
        }
        MockInvestAccount account = ensureAccount(req.getUserId().trim());
        account.setCash(account.getCash().add(req.getAmount()));
        account.setRewardedAmount(account.getRewardedAmount().add(req.getAmount()));
        return toAdminAccount(account);
    }

    private MockInvestAccount ensureAccount(String userId) {
        return accountRepository.findById(userId).orElseGet(() -> accountRepository.save(MockInvestAccount.builder()
                .userId(userId)
                .cash(INITIAL_CASH)
                .rewardedAmount(INITIAL_CASH)
                .build()));
    }

    private boolean isAdmin(String userId) {
        return userRepository.findById(userId)
                .map(User::getLogin)
                .map(login -> ADMIN_LOGIN.equalsIgnoreCase(login))
                .orElse(false);
    }

    private void requireAdmin(String userId) {
        if (!isAdmin(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin only");
        }
    }

    private MockInvestOrder saveOrder(String userId, MockInvestOrder.OrderType type, MockInvestDto.StockResponse stock, long quantity) {
        return orderRepository.save(MockInvestOrder.builder()
                .userId(userId)
                .type(type)
                .symbol(stock.getSymbol())
                .name(stock.getName())
                .quantity(quantity)
                .price(stock.getPrice())
                .build());
    }

    private MockInvestDto.HoldingResponse toHolding(MockInvestHolding h) {
        MockInvestDto.StockResponse stock = quoteHoldingOrFallback(h);
        BigDecimal invested = h.getAveragePrice().multiply(BigDecimal.valueOf(h.getQuantity()));
        BigDecimal evaluated = stock.getPrice().multiply(BigDecimal.valueOf(h.getQuantity()));
        BigDecimal profit = evaluated.subtract(invested);
        return MockInvestDto.HoldingResponse.builder()
                .symbol(h.getSymbol())
                .name(stock.getName())
                .quantity(h.getQuantity())
                .averagePrice(h.getAveragePrice())
                .currentPrice(stock.getPrice())
                .invested(invested)
                .evaluated(evaluated)
                .profit(profit)
                .profitRate(rate(profit, invested))
                .build();
    }

    private MockInvestDto.StockResponse quoteHoldingOrFallback(MockInvestHolding h) {
        try {
            return stockClient.quote(h.getSymbol());
        } catch (RuntimeException e) {
            return MockInvestDto.StockResponse.builder()
                    .symbol(h.getSymbol())
                    .name(h.getName())
                    .price(h.getAveragePrice())
                    .change(BigDecimal.ZERO)
                    .changeRate(BigDecimal.ZERO)
                    .volume(0L)
                    .marketCap(BigDecimal.ZERO)
                    .sector("UNAVAILABLE")
                    .high(h.getAveragePrice())
                    .low(h.getAveragePrice())
                    .description("현재 시세를 불러올 수 없어 평균 매입가로 평가합니다.")
                    .points(List.of(h.getAveragePrice()))
                    .realtime(false)
                    .build();
        }
    }

    private MockInvestDto.StockResponse quoteWatchOrFallback(MockInvestWatchlist w) {
        try {
            return stockClient.quote(w.getSymbol());
        } catch (RuntimeException e) {
            return MockInvestDto.StockResponse.builder()
                    .symbol(w.getSymbol())
                    .name(w.getName())
                    .price(BigDecimal.ZERO)
                    .change(BigDecimal.ZERO)
                    .changeRate(BigDecimal.ZERO)
                    .volume(0L)
                    .marketCap(BigDecimal.ZERO)
                    .sector("UNAVAILABLE")
                    .high(BigDecimal.ZERO)
                    .low(BigDecimal.ZERO)
                    .description("현재 시세를 불러올 수 없는 관심 종목입니다.")
                    .points(List.of())
                    .realtime(false)
                    .build();
        }
    }

    private MockInvestDto.OrderResponse toOrder(MockInvestOrder o) {
        return MockInvestDto.OrderResponse.builder()
                .id(o.getId())
                .type(o.getType().name())
                .symbol(o.getSymbol())
                .name(o.getName())
                .quantity(o.getQuantity())
                .price(o.getPrice())
                .createdAt(o.getCreatedAt())
                .build();
    }

    private MockInvestDto.JournalResponse toJournal(MockInvestJournal j) {
        return MockInvestDto.JournalResponse.builder()
                .id(j.getId())
                .symbol(j.getSymbol())
                .name(j.getName())
                .title(j.getTitle())
                .content(j.getContent())
                .result(j.getResult())
                .createdAt(j.getCreatedAt())
                .updatedAt(j.getUpdatedAt())
                .build();
    }

    private MockInvestDto.StockRequestResponse toStockRequest(MockInvestStockRequest request) {
        User user = userRepository.findById(request.getUserId()).orElse(null);
        return MockInvestDto.StockRequestResponse.builder()
                .id(request.getId())
                .userId(request.getUserId())
                .nickname(user != null ? displayName(user) : request.getUserId())
                .company(request.getCompany())
                .symbol(request.getSymbol())
                .memo(request.getMemo())
                .status(request.getStatus().name())
                .createdAt(request.getCreatedAt())
                .build();
    }

    private MockInvestDto.AdminAccountResponse toAdminAccount(MockInvestAccount account) {
        MockInvestDto.PortfolioResponse p = portfolio(account.getUserId());
        User user = userRepository.findById(account.getUserId()).orElse(null);
        return MockInvestDto.AdminAccountResponse.builder()
                .userId(account.getUserId())
                .login(user != null ? user.getLogin() : null)
                .nickname(user != null ? displayName(user) : account.getUserId())
                .avatarUrl(user != null ? user.getAvatarUrl() : null)
                .cash(p.getCash())
                .rewardedAmount(p.getRewardedAmount())
                .invested(p.getInvested())
                .evaluated(p.getEvaluated())
                .totalAsset(p.getTotalAsset())
                .profit(p.getProfit())
                .profitRate(p.getProfitRate())
                .build();
    }

    private String displayName(User user) {
        return user.getName() != null && !user.getName().isBlank() ? user.getName() : user.getLogin();
    }

    private String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private BigDecimal rate(BigDecimal profit, BigDecimal base) {
        if (base == null || base.compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
        return profit.multiply(BigDecimal.valueOf(100)).divide(base, 2, RoundingMode.HALF_UP);
    }
}
