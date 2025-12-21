$(document).ready(function () {
    $('#loginForm').on('submit', function (e) {
        e.preventDefault();
        $('.error-message').hide();

        const username = $('#username').val().trim();
        const password = $('#password').val();

        let hasError = false;

        if (!username) {
            $('#usernameError').text('Please enter a username').show();
            hasError = true;
        }

        if (!password) {
            $('#passwordError').text('Please enter a password').show();
            hasError = true;
        }

        if (hasError) {
            return;
        }

        $('#submitBtn').prop('disabled', true).html('Logging in');
        $.ajax({
            url: '/api/login',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ username, password }),
            success: function (data) {
                if (data.success) {
                    window.location.href = './';
                } else {
                    $('#errorMessage').text(data.message || 'Invalid username or password').show();
                    $('#submitBtn').prop('disabled', false).text('Login');
                }
            },
            error: function (error) {
                console.error('Login request failed:', error);
                $('#errorMessage').text('Login request failed, please try again later').show();
                $('#submitBtn').prop('disabled', false).text('Login');
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
        password: false
    }

    function updateFormStatus() {
        if (formStatus.username && formStatus.password) {
            $('#submitBtn').prop('disabled', false).text('Login');
        } else {
            $('#submitBtn').prop('disabled', true).text('Login');
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
});