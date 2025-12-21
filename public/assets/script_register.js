
$(document).ready(function () {
    function loadCaptcha() {
        $('#captchaImage').attr('src', '/api/captcha?' + Date.now());
    }

    $('#captchaImage').on('click', loadCaptcha);

    $('#loginForm').on('submit', function (e) {
        e.preventDefault();

        $('.error-message').hide();

        const username = $('#username').val().trim();
        const password = $('#password').val();
        const repeatPassword = $('#repeatPassword').val();
        const captcha = $('#captcha').val().trim();

        let hasError = false;

        if (!username) {
            $('#usernameError').text('Please enter a username').show();
            hasError = true;
        }
        if (!password) {
            $('#passwordError').text('Please enter a password').show();
            hasError = true;
        }
        if (password !== repeatPassword) {
            $('#repeatPasswordError').text('Passwords do not match').show();
            hasError = true;
        }
        if (!captcha) {
            $('#captchaError').text('Please enter a captcha').show();
            hasError = true;
        }

        if (hasError) {
            return;
        }

        $('#submitBtn').prop('disabled', true).text('Signing Up');

        $.ajax({
            url: '/api/register',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ username, password, captcha }),
            success: function (data) {
                if (data.success) {
                    alert('Registration successful');
                    window.location.href = '/login';
                } else {
                    $('#errorMessage').text(data.message || 'Registration failed, please try again later').show();
                    loadCaptcha();
                    $('#submitBtn').prop('disabled', false).text('Sign Up');
                }
            },
            error: function (error) {
                console.error('Registration request failed: ', error);
                $('#errorMessage').text('Registration request failed, please try again later').show();
                loadCaptcha();
                $('#submitBtn').prop('disabled', false).text('Sign Up');
            }
        });
    });

    $('.form-input').on('focus', function () {
        $(this).parent().find('.error-message').hide();
    });

    $('.form-input').on('blur', function () {
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 100);
    });

    const formStatus = {
        username: false,
        password: false,
        repeatPassword: false,
        captcha: false
    }

    function updateFormStatus() {
        if (formStatus.username && formStatus.password && formStatus.captcha) {
            $('#submitBtn').prop('disabled', false)
        } else {
            $('#submitBtn').prop('disabled', true)
        }
    }

    $('#username').on('input', function () {
        const text = $(this).val().trim();
        const MAX_USER_NAME_LENGTH = { AlphaIM: MAX_USER_NAME_LENGTH };
        formStatus.username = (text !== '') && (text.length >= { AlphaIM: MIN_USER_NAME_LENGTH }) && (text.length <= MAX_USER_NAME_LENGTH || MAX_USER_NAME_LENGTH <= 0) && /^[a-zA-Z0-9_]+$/.test(text);
        updateFormStatus();
    });

    $('#password').on('input', function () {
        const text = $(this).val().trim();
        var MAX_PASSWORD_LENGTH = { AlphaIM: MAX_PASSWORD_LENGTH };
        formStatus.password = (text !== '') && (text.length >= { AlphaIM: MIN_PASSWORD_LENGTH }) && (text.length <= MAX_PASSWORD_LENGTH || MAX_PASSWORD_LENGTH <= 0);
        updateFormStatus();
    });

    $('#repeatPassword').on('input', function () {
        const text = $(this).val().trim();
        formStatus.repeatPassword = text === $('#password').val().trim();
        updateFormStatus();
    });

    $('#captcha').on('input', function () {
        const text = $(this).val().trim();
        formStatus.captcha = text !== '' && text.length === 4;
        updateFormStatus();
    });

    $('.captcha-image').height($('.captcha-input').height() + 22);

    loadCaptcha();
});