+++
title = "Extend Keycloak with SPIs to Automatically Send Welcome Emails to New Users"
date = "2024-08-18T18:59:00Z"
draft = false
description = "In this article, we'll create a custom Service Provider Interface (SPI) event listener in Keycloak that automatically sends a welcome email whenever a new user registers. We'll start by setting up a Keycloak development environment using Docker, configure it via the Admin REST API, and use Mailtrap to test the email functionality. \n\n\n\n"
tags = ["keycloak", "java", "oidc", "spi"]
+++

Before diving in, make sure you have the following prerequisites in place:

- **Java Development Setup**: You should have Java installed.
- **Maven**: We will use maven for building the Keycloak extension.
- **Docker**: We will use docker to spin up a development container quickly.
- **Mailtrap Account** or **Email server**: Sign up for a free Mailtrap account. We'll use Mailtrap to test that the emails are sent correctly without needing a real SMTP server. You can use your own email server if you prefer.
-

### Preparing Keycloak Environment for SPI Development

To get started with developing and testing the SPI, we first need to set up the Keycloak environment and configure it to use a mail server. For simplicity, we’ll use [Mailtrap](https://mailtrap.io), but feel free to use your own mail server if you have one.

#### Step 1: Set Up a Mailtrap Inbox

1. Create an account on [Mailtrap](https://mailtrap.io) and create a new inbox. This will allow us to easily test the email functionality.
2. Once the inbox is set up, navigate to `Integrations -> SMTP` and take note of the following details: `Host`, `Port`, `Username`, and `Password`. We’ll need these values to configure Keycloak’s SMTP server settings later.

#### Step 2: Start Keycloak in a Docker Container

Next, we’ll start Keycloak in a Docker container along with a PostgreSQL database. To do this, create a `docker-compose.yaml` file in the root directory of your project with the following content:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:25.0.2
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: password
      KC_HOSTNAME: "http://localhost:8080"
      KC_HTTP_ENABLED: true
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    depends_on:
      - postgres
    ports:
      - "8080:8080"
    command:
      - start-dev

volumes:
  postgres_data:
```

To start the containers, run the following command in your terminal:

```sh
docker-compose up
```

This will pull the necessary images, start PostgreSQL, and launch Keycloak in development mode.

#### Step 3: Create a New Realm and Configure SMTP

Once the container is running we obtain an access token by authenticating with the Keycloak Admin API. make sure you have `curl` and `jq` installed

Once the Keycloak container is running, we need to authenticate with the Keycloak Admin API and obtain an access token. Make sure you have curl and jq installed, then run the following command:

```sh
TOKEN=$(curl -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin" \
     -d "password=admin" \
     -d "grant_type=password" \
     -d "client_id=admin-cli" | jq -r '.access_token')
```

This command authenticates with the Keycloak Admin API and stores the access token in the `TOKEN` variable for future API requests.

With the access token, we can now create a new realm and configure it to use the Mailtrap SMTP server. Run the following command, making sure to replace `YOUR-MAILTRAP-USERNAME` and `YOUR-MAILTRAP-PASSWORD` with the SMTP credentials from Mailtrap:

```sh
curl -X POST "http://localhost:8080/admin/realms" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
           "realm": "dev",
           "enabled": true,
           "displayName": "Test Realm",
           "sslRequired": "none",
           "registrationAllowed": true,
           "smtpServer": {
               "host": "smtp.mailtrap.io",
               "port": "25",
               "from": "noreply@idp.dev.com",
               "auth": true,
               "user": "YOUR-MAILTRAP-USERNAME",
               "password": "YOUR-MAILTRAP-PASSWORD",
               "ssl": false,
               "starttls": true
           }
         }'
```

This command creates a new realm called dev and configures the Mailtrap SMTP server to handle email sending for this realm.

### Building a Custom SPI to Send Welcome Emails

Now that the Keycloak environment is ready, we can start building the custom Service Provider Interface (SPI) to send a welcome email to users after registration. We'll begin by creating a Maven project to structure our code and implement the logic for sending emails.

To create the Maven project, run the following command:

```sh
mvn archetype:generate -DgroupId=com.adelhub.kc \
-DartifactId=welcome-mail-listener \
-DarchetypeArtifactId=maven-archetype-quickstart \
-DinteractiveMode=false
```

After running the Maven command, your project structure will look like this:

```sh
├── docker-compose.yaml
└── welcome-mail-listener
    ├── pom.xml
    └── src
        ├── main
        │   └── java
        │       └── com
        │           └── adelhub
        │               └── kc
        │                   └── App.java
        └── test
            └── java
                └── com
                    └── adelhub
                        └── kc
                            └── AppTest.java
```

Edit your pom.xml file to add the following depndencies

```xml
    <properties>
        <keycloak.version>25.0.2</keycloak.version>
    </properties>

  <dependencies>
    <!-- Pebble template engine -->
    <dependency>
        <groupId>io.pebbletemplates</groupId>
        <artifactId>pebble</artifactId>
        <version>3.2.2</version>
    </dependency>

    <!-- SLF4J API for logging -->
    <dependency>
        <groupId>org.slf4j</groupId>
        <artifactId>slf4j-api</artifactId>
        <version>2.0.10</version>
    </dependency>

    <!-- Keycloak Server SPI (provided by Keycloak runtime) -->
    <dependency>
        <groupId>org.keycloak</groupId>
        <artifactId>keycloak-server-spi</artifactId>
        <version>${keycloak.version}</version>
        <scope>provided</scope>
    </dependency>

    <!-- Keycloak Server SPI Private (provided by Keycloak runtime) -->
    <dependency>
        <groupId>org.keycloak</groupId>
        <artifactId>keycloak-server-spi-private</artifactId>
        <version>${keycloak.version}</version>
        <scope>provided</scope>
    </dependency>

    <!-- Keycloak Services (provided by Keycloak runtime) -->
    <dependency>
        <groupId>org.keycloak</groupId>
        <artifactId>keycloak-services</artifactId>
        <version>${keycloak.version}</version>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

Since we are using a third-party depndency `pebble` for templating which is not a part of the Keycloak Quarkus runtime we need to instruct maven to package this depndency
into the generated JAR. we achieve this using the `maven-shade-plugin`

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-shade-plugin</artifactId>
            <version>3.2.4</version>
            <executions>
                <execution>
                    <phase>package</phase>
                    <goals>
                        <goal>shade</goal>
                    </goals>
                    <configuration>
                        <createDependencyReducedPom>false</createDependencyReducedPom>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

This is very important. Otherwise we will recieve `java.lang.ClassNotFoundException`

Next, we need to create the HTML and text templates for the emails. We will be using `Pebble Templates`, a lightweight and fast templating engine, to generate these email templates dynamically based on user data.

We begin by creating two files: one for the HTML version and one for the plain-text version of the welcome email in the resources directory(`src/main/resources`).

```sh
cd welcome-mail-listener/
mkdir -p src/main/resources/templates
touch src/main/resources/templates/welcome-email.html
touch src/main/resources/templates/welcome-email.txt
```

For example we can populate the files as follows:

`welcome-email.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Welcome to Our Service!</title>
  </head>
  <body>
    <h1>Welcome to Our Service!</h1>
    <p>Dear {{ firstName }},</p>
    <p>
      We're glad to have you. Please let us know if you need any assistance.
    </p>
    <p>Best regards,<br />The Team</p>
  </body>
</html>
```

`welcome-email.txt`:

```text
Welcome to Our Service!

Dear {{ firstName }},

We're glad to have you. Please let us know if you need any assistance.

Best regards,
The Team
```

After setting up the templates, the next step is to create two classes that will handle the event listener logic: `WelcomeEmailEventListenerProviderFactory` and `WelcomeEmailEventListenerProvider`.

First, create the `WelcomeEmailEventListenerProvider` class. This class will handle user registration events and trigger a welcome email when a new user registers.

```sh
 rm src/main/java/com/adelhub/kc/App.java
 touch src/main/java/com/adelhub/kc/WelcomeEmailEventListenerProvider.java
```

To achieve this, we need to implement Keycloak's `EventListenerProvider` interface. By implementing this interface, we can hook into Keycloak's event system and define custom logic for each event type (such as user registrations, logins, or administrative actions). Let's take a look at the interface definition:

```java
public interface EventListenerProvider extends Provider {

    /**
     *
     * Called when a user event occurs e.g. log in, register.
     * <p/>
     * Note this method should not do any action that cannot be rolled back, see {@link EventListenerProvider} javadoc
     * for more details.
     *
     * @param event to be triggered
     */
    void onEvent(Event event);

    /**
     *
     * Called when an admin event occurs e.g. a client was updated/deleted.
     * <p/>
     * Note this method should not do any action that cannot be rolled back, see {@link EventListenerProvider} javadoc
     * for more details.
     *
     * @param event to be triggered
     * @param includeRepresentation when false, event listener should NOT include representation field in the resulting
     *                              action
     */
    void onEvent(AdminEvent event, boolean includeRepresentation);
```

As you can see the `EventListenerProvider` interface has two main methods:

- `onEvent(Event event)`: Handles user-related events (e.g., registration, login).
- `onEvent(AdminEvent event, boolean includeRepresentation)` : Handles admin-specific events

We will hook into both types of events and send a Welcome email whenever a new user registers or a new user has been created by an admin. Let's write the basic structure of `WelcomeEmailEventListenerProvider`

```java
package com.adelhub.kc;

import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.template.PebbleTemplate;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

public class WelcomeEmailEventListenerProvider implements EventListenerProvider {

    private static final Logger logger = LoggerFactory.getLogger(WelcomeEmailEventListenerProvider.class);
    private final KeycloakSession session;

    // The Template engine we will use to dynamically evaluate our email templates
    private static final PebbleEngine pebbleEngine = new PebbleEngine.Builder().build();

    public static PebbleTemplate htmlTemplate; // Our HTML Email template
    public static PebbleTemplate textTemplate; // Our plain-text Email template

    // Static block to load templates
    static {
        try {
            // Initialize Pebble templates
            htmlTemplate = pebbleEngine.getTemplate("templates/welcome-email.html");
            textTemplate = pebbleEngine.getTemplate("templates/welcome-email.txt");

        } catch (Exception e) {
            logger.error("Error loading email templates", e);
        }
    }

    public WelcomeEmailEventListenerProvider(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void onEvent(Event event) {
        // Event handling logic will go here
    }

    @Override
    public void onEvent(AdminEvent event, boolean includeRepresentation) {
        // Admin Event handling logic will go here
    }

    @Override
    public void close() {
        // Cleanup code if necessary
    }
}
```

Next, we modify the `onEvent` methods to listen for the user registration event

```java
@Override
public void onEvent(Event event) {
    logger.info("Event received: {}", event.getType());
    if (event.getType().equals(EventType.REGISTER)) {
        logger.info("User registered with ID: {}", event.getUserId());
        UserModel user = session.users().getUserById(session.getContext().getRealm(), event.getUserId());
        sendWelcomeEmail(user); // We will implement this next
    }
}

@Override
public void onEvent(AdminEvent event, boolean includeRepresentation) {
    if (event.getResourceType() == ResourceType.USER && event.getOperationType() == OperationType.CREATE) {
        String userId = event.getResourcePath().split("/")[1];
        logger.info("User registered with ID: {}", userId);
        UserModel user = session.users().getUserById(session.getContext().getRealm(), userId);
        if(user != null) {
            sendWelcomeEmail(user); // We will implement this next
        }

    }

}
```

Then we create the `sendWelcomeEmail` method, which will load the HTML and text templates, and render them with user-specific data

```java
private void sendWelcomeEmail(UserModel user) {
    String firstName = user.getFirstName();
    // Prepare data for the template
    Map<String, Object> context = new HashMap<>();
    context.put("firstName", firstName);

    StringWriter htmlWriter = new StringWriter();
    StringWriter textWriter = new StringWriter();
    try {
        // Render the templates using Pebble
        htmlTemplate.evaluate(htmlWriter, context);
        textTemplate.evaluate(textWriter, context);
    } catch (Exception e) {
        logger.error("Error evaluating templates", e);
        return;
    }

    String htmlBody = htmlWriter.toString();
    String textBody = textWriter.toString();
    String subject = "Welcome to our Awesome App";

    sendEmail(user, subject, htmlBody, textBody); // we will implement this method next
}
```

and the `sendEmail` method:

```java
private void sendEmail(UserModel user, String subject, String htmlBody, String textBody) {

    EmailSenderProvider emailSender = session.getProvider(EmailSenderProvider.class);
    try {
        emailSender.send(session.getContext().getRealm().getSmtpConfig(), user, subject, textBody, htmlBody);
    } catch (EmailException e) {
        logger.error("Error sending email", e);
    }
}
```

Now our `WelcomeEmailEventListenerProvider` class should look like:

```java
package com.adelhub.kc;

import io.pebbletemplates.pebble.PebbleEngine;
import io.pebbletemplates.pebble.template.PebbleTemplate;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;
import org.keycloak.events.admin.OperationType;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.keycloak.events.admin.ResourceType;


import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

public class WelcomeEmailEventListenerProvider implements EventListenerProvider {

    private static final Logger logger = LoggerFactory.getLogger(WelcomeEmailEventListenerProvider.class);

    private final KeycloakSession session;

    // Pebble engine and templates, loaded once statically
    private static final PebbleEngine pebbleEngine = new PebbleEngine.Builder().build();
    private static PebbleTemplate htmlTemplate;
    private static PebbleTemplate textTemplate;

    // Static block to load templates only once
    static {
        try {
            // Initialize Pebble templates
            htmlTemplate = pebbleEngine.getTemplate("templates/welcome-email.html");
            textTemplate = pebbleEngine.getTemplate("templates/welcome-email.txt");

        } catch (Exception e) {
            logger.error("Error loading email templates", e);
        }
    }

    public WelcomeEmailEventListenerProvider(KeycloakSession session) {
        this.session = session;
    }

    @Override
    public void onEvent(Event event) {
        logger.info("Event received: {}", event.getType());
        if (event.getType().equals(EventType.REGISTER)) {
            logger.info("User registered with ID: {}", event.getUserId());
            UserModel user = session.users().getUserById(session.getContext().getRealm(), event.getUserId());
            sendWelcomeEmail(user);
        }
    }

    @Override
    public void onEvent(AdminEvent event, boolean includeRepresentation) {
        if (event.getResourceType() == ResourceType.USER && event.getOperationType() == OperationType.CREATE) {
            String userId = event.getResourcePath().split("/")[1];
            logger.info("User registered with ID: {}", userId);
            UserModel user = session.users().getUserById(session.getContext().getRealm(), userId);
            if(user != null) {
                sendWelcomeEmail(user);
            }

        }

    }

    @Override
    public void close() {

    }

    private void sendWelcomeEmail(UserModel user) {
        String firstName = user.getFirstName();
        // Prepare data for the template
        Map<String, Object> context = new HashMap<>();
        context.put("firstName", firstName);

        StringWriter htmlWriter = new StringWriter();
        StringWriter textWriter = new StringWriter();
        try {
            // Render the templates using Pebble
            htmlTemplate.evaluate(htmlWriter, context);
            textTemplate.evaluate(textWriter, context);
        } catch (Exception e) {
            logger.error("Error evaluating templates", e);
            return;
        }

        String htmlBody = htmlWriter.toString();
        String textBody = textWriter.toString();
        String subject = "Welcome to our Awesome App";

        // Send the email
        sendEmail(user, subject, htmlBody, textBody);
    }

    private void sendEmail(UserModel user, String subject, String htmlBody, String textBody) {

        EmailSenderProvider emailSender = session.getProvider(EmailSenderProvider.class);
        try {
            emailSender.send(session.getContext().getRealm().getSmtpConfig(), user, subject, textBody, htmlBody);
        } catch (EmailException e) {
            logger.error("Error sending email", e);
        }
    }
}
```

Next, To register our custom `WelcomeEmailEventListenerProvider` in Keycloak, you need to implement a factory class. Keycloak uses the factory design pattern to create instances of providers. Thus we will create `WelcomeEmailEventListenerProviderFactory`

```sh
 rm src/main/java/com/adelhub/kc/App.java
 touch src/main/java/com/adelhub/kc/WelcomeEmailEventListenerProviderFactory.java
```

The `WelcomeEmailEventListenerProviderFactory` will implement the `EventListenerProviderFactory` which itself extends `ProviderFactory<EventListenerProvider>`
Let’s take a quick look at the Interface

```java
public interface EventListenerProviderFactory extends ProviderFactory<EventListenerProvider> {

}
public interface ProviderFactory<T extends Provider> {

    T create(KeycloakSession session);

    /**
     * Only called once when the factory is first created.  This config is pulled from keycloak_server.json
     *
     * @param config
     */
    void init(Config.Scope config);

    /**
     * Called after all provider factories have been initialized
     */
    void postInit(KeycloakSessionFactory factory);

    /**
     * This is called when the server shuts down.
     *
     */
    void close();

    String getId();

    default int order() {
        return 0;
    }

    /**
     * Returns the metadata for each configuration property supported by this factory.
     *
     * @return a list with the metadata for each configuration property supported by this factory
     */
    default List<ProviderConfigProperty> getConfigMetadata() {
        return Collections.emptyList();
    }
}
```

As you can see, the `ProviderFactory` interface defines several methods to manage the lifecycle of a provider, including initialization, creation, and cleanup. However, for our purposes in `WelcomeEmailEventListenerProviderFactory`, the most important methods are:

- `create(KeycloakSession session)`: for creating and returning an instance of our custom `WelcomeEmailEventListenerProvider` and supplying it with the current keycloak session.
- `getId()`: provides a unique identifier for our event listener, which Keycloak uses to register and reference the listener.

We can now implement our factory.

```java
package com.adelhub.kc;

import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class WelcomeEmailEventListenerProviderFactory implements EventListenerProviderFactory {

    private static final Logger logger = LoggerFactory.getLogger(WelcomeEmailEventListenerProvider.class);

    @Override
    public EventListenerProvider create(KeycloakSession session) {
        return new WelcomeEmailEventListenerProvider(session);
    }

    @Override
    public void init(Config.Scope config) {
        logger.info("Initialized welcome email provider");
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // Post Init logic goes here
    }

    @Override
    public void close() {
        // Clean up logic goes here
    }

    @Override
    public String getId() {
        // Important: ID is how Keycloak identifies our custom provider
        return "welcome-email-provider";
    }
}
```

##### Registering the Provider in Keycloak

Once the factory is created, we need to let Keycloak know about it. To do this, you must create a `META-INF/services` directory and register the factory class.

```sh
mkdir -p src/main/resources/META-INF/services
touch src/main/resources/META-INF/services/org.keycloak.events.EventListenerProviderFactory
```

Now we need to add the Fully Qualified Name of the Factory Class

```sh
echo "com.adelhub.kc.WelcomeEmailEventListenerProviderFactory" > src/main/resources/META-INF/services/org.keycloak.events.EventListenerProviderFactory
```

This tells Keycloak that your factory is available and should be used to create instances of the `WelcomeEmailEventListenerProvider`.

After performing the above steps, your directory structure should look like this

```sh
├── docker-compose.yaml
└── welcome-mail-listener
    ├── pom.xml
    ├── src
    │   ├── main
    │   │   ├── java
    │   │   │   └── com
    │   │   │       └── adelhub
    │   │   │           └── kc
    │   │   │               └── WelcomeEmailEventListenerProvider.java
    │   │   └── resources
    │   │       ├── META-INF
    │   │       │   └── services
    │   │       │       └── org.keycloak.events.EventListenerProviderFactory
    │   │       └── templates
    │   │           ├── welcome-email.html
    │   │           └── welcome-email.txt
    │   └── test
    │       └── java
    │           └── com
    │               └── adelhub
    │                   └── kc
    └── target
        ├── classes
        │   ├── META-INF
        │   │   └── services
        │   │       └── org.keycloak.events.EventListenerProviderFactory
        │   ├── com
        │   │   └── adelhub
        │   │       └── kc
        │   │           └── WelcomeEmailEventListenerProvider.class
        │   └── templates
        │       ├── welcome-email.html
        │       └── welcome-email.txt
        └── test-classes
            └── com
                └── adelhub
                    └── kc
```

where the `org.keycloak.events.EventListenerProviderFactory` file contains the fully qualified name of the factory class you created.

#### Building and Deploying the Welcome Email SPI

Once you’ve implemented both the factory and the event listener provider, build your project using Maven:

```sh
mvn clean package
```

This will package your SPI into a JAR file.

```sh
target
├── classes
├── generated-sources
├── generated-test-sources
├── maven-archiver
├── maven-status
├── test-classes
└── welcome-mail-listener-1.0-SNAPSHOT.jar
```

We now need to copy this JAR file into the Keycloak `providers` directory. Since we are using docker compose we will do that using a docker volume. edit your compose file to add

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
  keycloak:
    image: quay.io/keycloak/keycloak:25.0.2
    volumes: # Copy the JAR File into the providers directory inside of keycloak
      - ./welcome-mail-listener/target/welcome-mail-listener-1.0-SNAPSHOT.jar:/opt/keycloak/providers/welcome-mail-listener.jar
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: password
      KC_HOSTNAME: "http://localhost:8080"
      KC_HTTP_ENABLED: true
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    depends_on:
      - postgres
    ports:
      - "8080:8080"
    command:
      - start-dev

volumes:
  postgres_data:
```

After restarting the docker compose stack you should see something like the below in the container logs

```text
keycloak-1  | 2024-09-06 12:45:03,463 WARN  [org.key.services] (build-26) KC-SERVICES0047: welcome-email-provider (com.adelhub.kc.WelcomeEmailEventListenerProviderFactory) is implementing the internal SPI eventsListener. This SPI is internal and may change without notice
keycloak-1  | 2024-09-06 12:45:05,262 INFO  [io.qua.dep.QuarkusAugmentor] (main) Quarkus augmentation completed in 2458ms
keycloak-1  | 2024-09-06 12:45:06,051 INFO  [com.adelhub.kc.WelcomeEmailEventListenerProvider] (main) Initialized welcome email provider
```

which indicates that keycloak loaded the SPI.

Although Keycloak has now loaded the `welcome-email-listener` SPI, we still need to enable it for the realm. While this can be done via the UI by going to `Realm Settings → Events` and adding the listener to the Event Listeners field, we will enable it using the API for consistency.

_Step 1: Get Get an Admin Access Token_
{{< divwrapper id="admin-token-snippet" >}}
First, we need to authenticate and obtain an access token
{{< /divwrapper >}}

```sh
TOKEN=$(curl -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "username=admin" \
     -d "password=admin" \
     -d "grant_type=password" \
     -d "client_id=admin-cli" | jq -r '.access_token')
```

_Step 2: Enable the Custom Event Listener_
Now that we have the access token, we can enable the custom welcome-email-listener for the realm.

```sh
curl -X PUT "http://localhost:8080/admin/realms/dev" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
           "eventsListeners": ["jboss-logging", "welcome-email-listener"],
           "eventsEnabled": true
         }'
```

Replace `dev` in "http://localhost:8080/admin/realms/dev" with your realm name in case you choose to create a realm with a different name.

#### Verifying the Welcome Email Listener

With the `welcome-email-listener` SPI built, deployed, and enabled, it's time to verify its functionality. We will confirm that a welcome email is triggered upon both user registration through the admin API and direct registration through the Keycloak account console.

##### Step 1: Obtain a New Admin Token

First, obtain a new admin access token in case the previous one has expired by rerunning the [above](#admin-token-snippet) command

##### Step 2: Register a New User via Admin API

You can create a new user using the admin API with the following Curl request

```sh
curl -X POST "http://localhost:8080/admin/realms/dev/users" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
           "username": "bob",
           "enabled": true,
           "firstName": "Bob",
           "lastName": "Marley",
           "email": "bob@example.com",
           "credentials": [
             {
               "type": "password",
               "value": "strongpassword",
               "temporary": false
             }
           ]
         }'
```

##### Step 3: Register a New User via the Keycloak Account Console

You can also trigger the welcome email by registering a new user directly from the Keycloak account console. Follow these steps:

1. Open the Keycloak UI by navigating to [http://localhost:8080/auth/realms/dev/account/](http://localhost:8080/auth/realms/dev/account/).
2. Click Register to create a new user.
3. Complete the registration form with details like username, email, and password, then submit the form.

##### Step 4: Check Your Email

After registering the user via either method (API or UI), go to your inbox on [Mailtrap](mailtrap.io) to check for the welcome email. You should find a message sent from `noreply@idp.dev.com` to the newly registered user's email address (e.g., `bob@example.com`).

Here's a screenshot of the received email:

![Screenshot showing the recieved email](/images/extend-keycloak-with-spis-to-automatically-send-welcome-emails-to-new-users/welcome-email-to-bob.png)

### Wrapping Up

In this post, we explored how to extend Keycloak with a custom SPI to automatically send welcome emails to new users. Whether users are created through the admin API or register via the Keycloak account console.

Now, this is just a simple example, and admittedly, it's not the most optimized solution (for instance, we’re sending the emails synchronously). There's definitely room for improvement but I hope the main ideas were clear.

You can check out all the code for this project on GitHub:

[View the code on GitHub](https://github.com/theadell/keycloak-spi-simple-weclome-email)

If you’ve got any feedback, questions or suggestions, don’t hesitate to reach out to me!
