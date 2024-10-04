+++
date = '2024-09-17T19:49:46+02:00'
draft = true
title = 'OAuth2 in Go Demystified: A Complete Guide to the x/oauth2 Package'
tags= ["OAuth 2.0", "web"]
description= "In this article, we’ll break down OAuth 2.0 and the x/oauth2 package in Go, then put it into practice by building a web client with Google Login and Google Drive integration, using Go’s html/template and SQLite for data storage."
+++

### The Theory { .bb }

Before we explore the x/oauth2 package, it’s important to first understand OAuth 2.0. Depending on who you talk to, OAuth 2.0 can either seem like a simple token exchange or a very complex topic on web identity and security. This is because OAuth 2.0 is a “framework,” not a strict web protocol with clearly defined rules. Instead, it’s more like a set of evolving guidelines.

If you’ve worked with OAuth 2.0 before, you may have noticed that each provider implements it a bit differently. In fact, if you visit
[oauth.net/specs](oauth.net/specs),
you’ll see that OAuth 2.0 now has over 30 Request for Comments (RFCs) and several active drafts. You can imagine how each provider might choose to implement a different subset of these RFCs.

For someone who doesn’t work in identity and access management, navigating these documents can be overwhelming. They are filled with technical jargon, frequently reference each other, and sometimes even contradict or deprecate previous standards.
Luckily, as application developers, most of this complexity falls on the shoulders of identity and access management (IAM) folks, particularly those building authentication servers. From the (our) client's perspective, things are much simpler. In fact, the x/oauth2 package does most of the heavy lifting, abstracting away the details for us.

For all intents and purposes, what application developers need to understand about OAuth 2.0
is that it’s a framework for securing access to resources through token-based authentication.
OAuth 2.0 defines multiple [_flows_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-protocol-flow),
which are essentially different ways an application can obtain access tokens based on how it's being used
(e.g., a web app, mobile app, or a device without a browser). While the specification includes many flows and extensions,
as web developers, we only need to focus on a small subset. The most important one is the
[Authorization Code Flow](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-authorization-code-grant),
which we use in nearly all cases. The _Password Grant_ and _Implicit Flow_ have been
[deprecated in OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#section-10.1) and are no longer relevant.
Extensions like the Device Flow or Client Credentials Flow serve specialized use cases that we rarely need to concern ourselves with.

So when is that useful? Let’s say you’re building an app that generates reports for users.
Instead of making them manually download each report and upload it to their Google Drive,
you want your app to automatically sync the reports to their Google Drive whenever a new batch is available.
But, you don’t want users to have to give you their Google password. This is where OAuth 2.0 is useful.
It lets users give your app permission to upload reports to their Google Drive without ever sharing their passwords.

#### The OAuth Dance

In the Authorization Code Flow, we redirect the user to the provider (like Google),
telling them what access we need via query parameters in the URL. The user approves, and we get an authorization code in return.
We then exchange that code for an access token, which lets us make requests on the user's behalf.
Now, let’s break it down with a simple example

When a user wants to enable automatic syncing of reports to their Google Drive, your app prepares to send
a request to Google. It’s like saying, _“Hey Google, I’m the Such-and-Such app, and I’d like permission to
upload reports to this user’s Drive. Could you ask them if that’s okay? And by the way, when they
approve, send them back to me at this specific address (the redirect URL).”_ But this request isn’t
made directly. Instead, your app redirects the user’s browser to Google so that Google can handle the
approval process. This step of sending the user to Google to grant permission is called the [_Authorization
Request._](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.1)

{{< figure src="/images/oauth2-in-go-demystified/auth_req.svg" class="mt-2" alt="The authorization request" >}}

Of course, this _authorization request_ isn't a direct call between your app and Google.
Instead, we rely on browser redirects to send the user to Google.
Since this happens through the user's browser, This is known as _front-channel communication_. ( which is inherintly insecure
as it is visible in the browser and proxy logs)

The browser will make a GET request for us and then Google will ask the user: _“This app wants to upload reports to your
Google Drive—do you give it permission?”_ If the user grants access, Google issues an _authorization code_ and delivers it to
your app by adding a _code_ query paramater to the redirection URI. The response looks something like

```bash
HTTP/1.1 302 Found
Location: https://yourapp.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz
```

Now, your app recieves this request, extracts the code from the URL and use it to create an [_Access Token Request_](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.1)
to _exchange_ the code for an access token it can use to authenticate its requests against the Google API.

Since the user is no longer involved at this stage, your app can now use _back-channel communication_, meaning it can send a direct
HTTPS request to exchange the authorization code for an access token without relying on browser redirects

For [_confidential clients_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-client-types)
(such as a Go web app or API), this token request also requires the app to [_authenticate itself_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-client-authentication)
by sending its _client ID_ and [_client secret_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#section-2.4.1).
For public clients (like mobile apps or single-page applications), there’s no need
for a client secret, as these apps can’t securely store it (these apps are inherintly less secure). Here is an example of
the code to token exchange

```bash
# Request
POST /token HTTP/1.1
Host: oauth2.googleapis.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=SplxlOBeZQQYbYS6WxSbIA&
client_id=your-client-id&
client_secret=your-client-secret&
redirect_uri=https://yourapp.com/callback

# Response
HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "ya29.a0ARrdaM...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "https://www.googleapis.com/auth/drive.file"
}

```

Now, with the [_access token_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-access-token),
your app can act on behalf of the user to make authorized API requests, such as uploading documents to Google Drive.
The access token allows your app to perform these actions for a limited time, typically specified in the _expires_in_ field. if your
app requires long-term access, it can request the _offline_access_ scope during the authorization request.
This grants your app a [_refresh token_](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-11#name-refresh-token),
which can be used to obtain a new access token whenever the current one expires,
without needing the user to reauthorize. This is especially useful for long-lived services (like the one we will be developing).

#### PKCE - Fancy Name, Easy Stuff

Now that we've covered how the token exchange works, let’s briefly discuss Proof Key for Code Exchange (PKCE), which is a simple but effective way to add security, particularly for public clients like SPAs or mobile apps. PKCE was originally designed to prevent malicious apps from intercepting the authorization code and exchanging it for a token.

As we've seen, confidential clients (like server-side apps) must authenticate using a client ID and client secret when exchanging the authorization code for a token. This ensures that even if the code is exposed during the less secure front-channel communication, it is useless without the credentials stored safely on the server.

However, public clients (like mobile apps or desktop apps) can't securely store secrets.
That's where PKCE comes in. It leverages the fact that the flow is split into two steps (authorization request and token request).
In the first step, the app sends a hashed version of a random value (called the _code_challenge_) and the hashing method in the
authorization request (sent over the front channel as query params).
This request can be intercepted, but since it's just a hash, it’s safe.

```bash
GET /auth?response_type=code&
client_id=your-client-id&
redirect_uri=https://yourapp.com/callback&
code_challenge=hashOfRandomValue&
code_challenge_method=S256

```

When the app later makes the token request over HTTPS, it sends the original random value (the _code_verifier_).
The server then hashes this value and compares it to the previously sent hash. Since reversing a hash is computationally infeasible,
even if the front channel is exposed, it’s not possible for an attacker to obtain the original random value.
This essentially acts as a dynamic credential, making the exchange secure without relying on a stored secret.

```bash
POST /token HTTP/1.1
Host: oauth2.googleapis.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=authorization_code_received_earlier&
redirect_uri=https://yourapp.com/callback&
client_id=your-client-id&
code_verifier=originalRandomValue
```

Since it's such an easy thing to implement, it's recommended to use PKCE even with confidential clients as it adds another
layer of security at no additional cost. For public clients, PKCE is absolutely required

We could, of course, dive deeper into the specifics of each flow, client type, security mechanism, and app architecture
but there’s no need to overcomplicate things. We've already covered the key concepts, and the finer details are best understood
in practice as they come up. we’ll move on to exploring how the x/oauth2 package simplifies these processes for us and handles
much of the heavy lifting.

### The x/oauth2 package { .bb }

The `x/oauth2` package is a client's implementation of the OAuth 2.0 framwork that models its flows very nicely and offers us
a clean and simple API that abstracts most of the complexity for us that we can use to integrate OAuth into our apps.

###### Setting Up the Client Configuration

Before we can begin the OAuth process, we need a way to store the information (the client ID, redirect URL, and endpoints)
about our app (the "client") and the OAuth provider.
The `Config` struct handles that for us

```go
config := oauth2.Config{
    ClientID:     "your-client-id",
    ClientSecret: "your-client-secret",
    RedirectURL:  "https://yourapp.com/callback",
    Scopes:       []string{"profile", "email"},
    Endpoint:     google.Endpoint,
}
```

###### The Auth Request

Once the configuration is set up, we can generate the authorization URL:

```go
authURL := config.AuthCodeURL("random-state-string")
```

This URL is what you’ll redirect the user to. The `state` parameter is a random string used to maintain state between the request
and callback, helping prevent CSRF attacks.

We might need to customize the authorization request further, we can easily do this using `AuthCodeOption` which translates
to a key value pair `foo=bar` in the `authURL`

```go
authURL := config.AuthCodeURL("random-state-string",
    oauth2.AccessTypeOffline,
    oauth2.SetAuthURLParam("prompt", "consent"),
)
```

Here, `AccessTypeOffline` requests a refresh token, and `SetAuthURLParam` is used to pass any additional parameters,
such as forcing the consent screen to show again.

###### The Token Request

After the user authenticates, the provider redirects them back to your app with an authorization code.
This code can be exchanged for an access token using the `Exchange` method

```go
func AuthCallbackHandler(w http.ResponseWriter, r *http.Request) {
    state := r.URL.Query().Get("state")
    // validate state ...
    // ...

    code := r.URL.Query().Get("code")
    token, err := config.Exchange(context.Background(), code)
    if err != nil {
        // handle error
    }

}

```

###### Using the Token

Once we have the token, we can now make authenticated requests to the provider’s API.
for convenience, we can use the `Client` method to to attach the token to an HTTP client

```go
client := config.Client(context.Background(), token)
resp, err := client.Get("https://www.googleapis.com/oauth2/v1/userinfo?alt=json")

```

Access tokens are short lived and need to be refreshed. This is where TokenSource comes in. A `TokenSource`
will refresh the tokens for us behind the scenes when necessary

```go
tokenSource := oauth2.ReuseTokenSource(token, config.TokenSource(context.Background(), token))
client := oauth2.NewClient(context.Background(), tokenSource)
```

With that, we can now start building our project. Now, let's see how to put these pieces together in a web app.

### The Practice { .bb }

In this section, we’ll build a simple web app in Go that demonstrates how to integrate OAuth 2.0 in a real-world scenario.
Our app will allow users to log in with Google, and we’ll integrate with Google Drive to automatically sync reports that
the app generates to the user’s Drive account. For simplicity, we’ll simulate this by letting users upload files,
but the core idea is to show how OAuth allows us to interact with third-party services.

To build this, we’ll use `net/http` for handling HTTP requests. `html/template` for rendering HTML,
`sqlite` as a database, and `github.com/alexedwards/scs/v2` for session managment.
