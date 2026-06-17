package com.playground;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = {
    org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration.class
})
public class PlaygroundApplication {
    public static void main(String[] args) {
        SpringApplication.run(PlaygroundApplication.class, args);
    }
}
