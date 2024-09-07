function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const themeIcon = document.getElementById('theme-icon');
    themeIcon.className = newTheme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
