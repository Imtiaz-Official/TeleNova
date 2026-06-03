# 🌌 TeleNova: Neural Cloud Storage

> **Transform Telegram into your private, unlimited, and encrypted neural storage network.**

TeleNova (formerly CyberDrive) is a high-performance, aesthetically-driven cloud storage interface built on top of the Telegram MTProto API. It leverages Telegram's infrastructure to provide a free, secure, and virtually unlimited file system with a modern, "soothing" cyberpunk interface.

---

## ✨ Features

- **🛡️ Neural Security:** Uses Telegram's robust encryption for all file transfers.
- **📂 Virtual File System (VFS):** Organize your Telegram files into folders and subfolders without affecting your actual chat history.
- **🔄 Smart Sync:** Automatically index existing files from your "Saved Messages" into your TeleNova drive.
- **🖼️ Instant Previews:** High-speed thumbnails for images and documents directly from the Telegram cloud.
- **🌗 Soothing Interface:** A "Neural-Dark" theme designed for long-running production environments and eye comfort.
- **📱 Cross-Platform:** Accessible via any modern web browser on Android, iOS, Windows, macOS, or Linux.
- **💾 Persistent Sessions:** Securely stored authentication ensures you stay logged in across server restarts.

---

## 🚀 Getting Started

### Prerequisites

1.  **Telegram API Credentials:**
    -   Go to [my.telegram.org](https://my.telegram.org).
    -   Log in and go to "API development tools".
    -   Create a new application to get your `API_ID` and `API_HASH`.
2.  **Environment:**
    -   [Node.js](https://nodejs.org/) (v16.x or higher)
    -   NPM or Yarn

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Imtiaz-Official/TeleNova.git
    cd TeleNova
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory:
    ```env
    PORT=3000
    API_ID=your_api_id
    API_HASH=your_api_hash
    ```

4.  **Launch the System:**
    ```bash
    npm start
    ```
    The server will be available at `http://localhost:3000`.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite3 (Persistent Sessions & File Indexing)
- **Protocol:** GramJS (Telegram MTProto implementation)
- **Frontend:** Pure HTML5/CSS3/JS (Neural-UI framework)
- **Icons:** Lucide Icons

---

## 🛡️ Security & Privacy

TeleNova **does not** store your Telegram password or messages on its own servers. It acts as a bridge between your browser and Telegram's servers. 
- Authentication strings are stored locally on *your* machine in a secure SQLite database.
- Files are hosted on Telegram's "Saved Messages" (private cloud).

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ for the Decentralized Web
</p>
