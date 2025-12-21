const dialogUtil = {
    dialogs: [],
    eDialogs: $('.dialogs'),
    new(option = {}) {
        const e = $('<div class="dialog"></div>')
        const id = this.dialogs.length

        if (option.title) {
            const eTitle = $('<div class="dialog-title"></div>')
            eTitle.text(option.title)
            e.append(eTitle)
        }

        if (option.content) {
            const eContent = $('<div class="dialog-content"></div>')
            if (option.contentIsHTML) {
                eContent.html(option.content)
            } else {
                eContent.text(option.content)
            }
            e.append(eContent)
        }

        if (option.button) {
            const eButtonContainer = $('<div class="button-container"></div>')
            e.append(eButtonContainer)
            for (const btn of option.button) {
                const eButton = $('<button></button>')
                if (btn.text) {
                    eButton.text(btn.text)
                }
                if (btn.onClick) {
                    eButton.click(() => {
                        btn.onClick(id)
                    })
                }
                eButtonContainer.append(eButton)
                if (btn.style === 'positive') {
                    eButton.addClass('positive')
                }
            }
        }

        this.dialogs[id] = e
        if (this.dialogs.length >= 2) {
            this.dialogs[this.dialogs.length - 2].hide()
        }
        this.eDialogs.append(e)
        this.eDialogs.css({
            'display': 'flex'
        })
    },
    close(id) {
        this.dialogs[id].remove()
        this.dialogs.splice(id, 1)
        if (this.dialogs.length === 0) {
            this.eDialogs.css({
                'display': 'none'
            })
        } else {
            this.dialogs[this.dialogs.length - 1].show()
        }
    }
}