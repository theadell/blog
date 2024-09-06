document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const preElement = button.nextElementSibling; 
    const codeToCopy = preElement.innerText;

    navigator.clipboard
      .writeText(codeToCopy)
      .then(() => {
        button.innerHTML = '<i class="fas fa-check"></i>'; 
        setTimeout(() => {
          button.innerHTML = '<i class="fas fa-copy"></i>';
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
      });
  });
});
