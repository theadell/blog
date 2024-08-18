+++
title = "Extend Keycloak with SPIs to Automatically Send Welcome Emails to New Users"
date = "2024-08-18T20:51:00Z"
draft = true
description = "In this article, we'll create a custom SPI event listener in Keycloak that automatically sends a welcome email whenever a new user registers. We'll start by setting up a Keycloak development environment using Docker, configure it via the Admin REST API, and use Mailtrap to test the email functionality. \n\n\n\n"
tags = ["keycloak"]
+++
Before diving in, make sure you have the following prerequisites in place:

* **Java Development Setup**: You should have Java installed.
* **Maven**: We will use maven for building the Keycloak extension.
* **Docker**: We will use docker to spin up a development container quickly. 
* **Mailtrap Account** or **Email server**: Sign up for a free Mailtrap account. We'll use Mailtrap to test that the emails are sent correctly without needing a real SMTP server. You can use your own email server if you prefer.

First, we create a new maven project 

```
mvn archetype:generate -DgroupId=com.adelhub.kc -DartifactId=welcome-mail-listener -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false
```
